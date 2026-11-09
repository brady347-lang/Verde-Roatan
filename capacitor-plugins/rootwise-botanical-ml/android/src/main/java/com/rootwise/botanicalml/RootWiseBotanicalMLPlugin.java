package com.rootwise.botanicalml;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.os.SystemClock;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;
import org.tensorflow.lite.DataType;
import org.tensorflow.lite.Interpreter;

import java.io.ByteArrayOutputStream;
import java.io.FileInputStream;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.MappedByteBuffer;
import java.nio.channels.FileChannel;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Capacitor adapter for the separately-authored RootWise Android botanical model.
 *
 * It performs genuine LiteRT embedding inference only when both the trained model and
 * model-aligned, provenance-bearing reference catalog are installed in Android assets.
 * It never fabricates embeddings or labels. Missing assets produce a not-ready state so
 * the existing app can use its established remote fallback.
 */
@CapacitorPlugin(name = "RootWiseBotanicalML")
public class RootWiseBotanicalMLPlugin extends Plugin {
    private static final String MODEL_ASSET = "botanical_mobilenetv4_512d.tflite";
    private static final String CATALOG_ASSET = "botanical_reference_embeddings.json";
    private static final String MODEL_VERSION = "mobilenetv4_512d_v1";
    private static final int INPUT_WIDTH = 224;
    private static final int INPUT_HEIGHT = 224;
    private static final int EMBEDDING_DIMENSION = 512;
    private static final int MAX_IMAGE_BYTES = 12 * 1024 * 1024;
    private static final float DEFAULT_THRESHOLD = 0.65f;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Object inferenceLock = new Object();
    private volatile Interpreter interpreter;
    private volatile JSONObject referenceCatalog;
    private volatile String initializationError;
    private volatile MappedByteBuffer mappedModel;

    @PluginMethod
    public void getReadiness(PluginCall call) {
        executor.execute(() -> {
            JSObject result = new JSObject();
            boolean modelReady = assetExists(MODEL_ASSET);
            boolean catalogReady = isReferenceCatalogReady();
            result.put("available", true);
            result.put("modelReady", modelReady);
            result.put("referenceCatalogReady", catalogReady);
            result.put("ready", modelReady && catalogReady);
            result.put("modelVersion", MODEL_VERSION);
            if (!modelReady) {
                result.put("reason", "The trained LiteRT model asset is not installed.");
            } else if (!catalogReady) {
                result.put("reason", "A model-aligned botanical reference catalog is not installed or failed validation.");
            } else if (initializationError != null) {
                result.put("reason", initializationError);
            }
            call.resolve(result);
        });
    }

    @PluginMethod
    public void identify(PluginCall call) {
        final String image = call.getString("image");
        final int topK = Math.max(1, Math.min(5, call.getInt("topK", 3)));
        final double thresholdValue = call.getDouble("confidenceThreshold", (double) DEFAULT_THRESHOLD);
        final float threshold = (float) Math.max(0.1, Math.min(0.99, thresholdValue));

        if (image == null || image.trim().isEmpty()) {
            call.reject("An image data URL or Base64 image is required.");
            return;
        }

        executor.execute(() -> {
            Bitmap bitmap = null;
            try {
                ensureReady();
                String encoded = image.trim();
                int comma = encoded.indexOf(',');
                if (encoded.startsWith("data:") && comma >= 0) encoded = encoded.substring(comma + 1);
                byte[] bytes = Base64.decode(encoded, Base64.DEFAULT);
                if (bytes.length == 0 || bytes.length > MAX_IMAGE_BYTES) {
                    throw new IllegalArgumentException("The image must be non-empty and no larger than 12 MB.");
                }
                bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                if (bitmap == null) throw new IllegalArgumentException("Android could not decode this image.");

                JSObject result;
                synchronized (inferenceLock) {
                    result = runInference(bitmap, topK, threshold);
                }
                call.resolve(result);
            } catch (Exception error) {
                call.reject(error.getMessage() == null ? "Local botanical inference failed." : error.getMessage(), error);
            } finally {
                if (bitmap != null && !bitmap.isRecycled()) bitmap.recycle();
            }
        });
    }

    private boolean assetExists(String name) {
        try (InputStream stream = getContext().getAssets().open(name)) {
            return stream != null;
        } catch (Exception ignored) {
            return false;
        }
    }

    private boolean isReferenceCatalogReady() {
        try {
            JSONObject catalog = loadReferenceCatalog();
            return catalog != null && catalog.getJSONArray("entries").length() > 0;
        } catch (Exception error) {
            initializationError = error.getMessage();
            return false;
        }
    }

    private JSONObject loadReferenceCatalog() throws Exception {
        try (InputStream stream = getContext().getAssets().open(CATALOG_ASSET);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int count;
            while ((count = stream.read(buffer)) != -1) output.write(buffer, 0, count);
            JSONObject catalog = new JSONObject(output.toString("UTF-8"));
            if (!MODEL_VERSION.equals(catalog.optString("model_version"))) {
                throw new IllegalArgumentException("Reference catalog model_version must be " + MODEL_VERSION + ".");
            }
            if (catalog.optInt("embedding_dimension", -1) != EMBEDDING_DIMENSION) {
                throw new IllegalArgumentException("Reference catalog embedding_dimension must be 512.");
            }
            if (!"minus_one_to_one".equals(catalog.optString("normalization"))) {
                throw new IllegalArgumentException("Reference catalog normalization must be minus_one_to_one.");
            }
            JSONArray entries = catalog.getJSONArray("entries");
            for (int i = 0; i < entries.length(); i++) {
                JSONObject entry = entries.getJSONObject(i);
                if (entry.optString("source_id").trim().isEmpty()) {
                    throw new IllegalArgumentException("Every reference entry must include a traceable source_id.");
                }
                JSONArray embedding = entry.getJSONArray("embedding");
                if (embedding.length() != EMBEDDING_DIMENSION) {
                    throw new IllegalArgumentException("Reference entry " + entry.optString("id") + " does not contain 512 embedding values.");
                }
                for (int j = 0; j < embedding.length(); j++) {
                    double value = embedding.getDouble(j);
                    if (Double.isNaN(value) || Double.isInfinite(value)) {
                        throw new IllegalArgumentException("Reference embeddings must contain finite numeric values.");
                    }
                }
            }
            return catalog;
        }
    }

    private void ensureReady() throws Exception {
        if (interpreter != null && referenceCatalog != null) return;
        synchronized (inferenceLock) {
            if (interpreter != null && referenceCatalog != null) return;
            referenceCatalog = loadReferenceCatalog();
            MappedByteBuffer model = loadModelFile();
            Interpreter.Options options = new Interpreter.Options().setNumThreads(4);
            Interpreter candidate = new Interpreter(model, options);
            try {
                validateModel(candidate);
                interpreter = candidate;
                mappedModel = model;
                initializationError = null;
            } catch (Exception error) {
                candidate.close();
                referenceCatalog = null;
                throw error;
            }
        }
    }

    private MappedByteBuffer loadModelFile() throws Exception {
        try (android.content.res.AssetFileDescriptor descriptor = getContext().getAssets().openFd(MODEL_ASSET);
             FileInputStream stream = new FileInputStream(descriptor.getFileDescriptor())) {
            FileChannel channel = stream.getChannel();
            return channel.map(FileChannel.MapMode.READ_ONLY, descriptor.getStartOffset(), descriptor.getLength());
        }
    }

    private void validateModel(Interpreter candidate) {
        if (candidate.getInputTensorCount() != 1 || candidate.getOutputTensorCount() < 1) {
            throw new IllegalArgumentException("The LiteRT model must expose one input tensor and at least one output tensor.");
        }
        if (candidate.getInputTensor(0).dataType() != DataType.FLOAT32 ||
                candidate.getOutputTensor(0).dataType() != DataType.FLOAT32) {
            throw new IllegalArgumentException("The LiteRT model input and output must both be FLOAT32.");
        }
        int[] inputShape = candidate.getInputTensor(0).shape();
        int[] outputShape = candidate.getOutputTensor(0).shape();
        if (!sameShape(inputShape, new int[]{1, INPUT_HEIGHT, INPUT_WIDTH, 3})) {
            throw new IllegalArgumentException("Expected model input shape [1,224,224,3].");
        }
        if (!sameShape(outputShape, new int[]{1, EMBEDDING_DIMENSION})) {
            throw new IllegalArgumentException("Expected model output shape [1,512].");
        }
    }

    private boolean sameShape(int[] actual, int[] expected) {
        if (actual.length != expected.length) return false;
        for (int i = 0; i < actual.length; i++) if (actual[i] != expected[i]) return false;
        return true;
    }

    private JSObject runInference(Bitmap original, int topK, float threshold) throws Exception {
        long started = SystemClock.elapsedRealtimeNanos();
        Bitmap scaled = Bitmap.createScaledBitmap(original, INPUT_WIDTH, INPUT_HEIGHT, true);
        ByteBuffer input = ByteBuffer.allocateDirect(INPUT_WIDTH * INPUT_HEIGHT * 3 * 4)
                .order(ByteOrder.nativeOrder());
        try {
            int[] pixels = new int[INPUT_WIDTH * INPUT_HEIGHT];
            scaled.getPixels(pixels, 0, INPUT_WIDTH, 0, 0, INPUT_WIDTH, INPUT_HEIGHT);
            for (int pixel : pixels) {
                input.putFloat((((pixel >> 16) & 0xff) - 127.5f) / 127.5f);
                input.putFloat((((pixel >> 8) & 0xff) - 127.5f) / 127.5f);
                input.putFloat(((pixel & 0xff) - 127.5f) / 127.5f);
            }
            input.rewind();
        } finally {
            if (scaled != original && !scaled.isRecycled()) scaled.recycle();
        }

        float[][] output = new float[1][EMBEDDING_DIMENSION];
        interpreter.run(input, output);
        float[] query = normalize(output[0]);
        List<Match> matches = new ArrayList<>();
        JSONArray entries = referenceCatalog.getJSONArray("entries");
        for (int i = 0; i < entries.length(); i++) {
            JSONObject entry = entries.getJSONObject(i);
            JSONArray raw = entry.getJSONArray("embedding");
            float[] reference = new float[EMBEDDING_DIMENSION];
            for (int j = 0; j < EMBEDDING_DIMENSION; j++) reference[j] = (float) raw.getDouble(j);
            float score = cosine(query, normalize(reference));
            matches.add(new Match(entry, score));
        }
        Collections.sort(matches, Comparator.comparingDouble((Match item) -> item.score).reversed());

        JSArray candidates = new JSArray();
        JSArray predictions = new JSArray();
        boolean matched = false;
        int count = Math.min(topK, matches.size());
        for (int i = 0; i < count; i++) {
            Match match = matches.get(i);
            JSONObject entry = match.entry;
            JSObject candidate = new JSObject();
            candidate.put("id", entry.optString("id"));
            candidate.put("common_name", entry.optString("common_name"));
            candidate.put("scientific_name", entry.optString("scientific_name"));
            candidate.put("family", entry.optString("family"));
            candidate.put("confidence_score", Math.max(0f, Math.min(1f, match.score)));
            candidates.put(candidate);
            JSObject prediction = new JSObject();
            prediction.put("label", entry.optString("scientific_name"));
            predictions.put(prediction);
            if (i == 0 && match.score >= threshold) matched = true;
        }

        float topScore = matches.isEmpty() ? 0f : matches.get(0).score;
        JSObject evidence = new JSObject();
        evidence.put("status", "success");
        evidence.put("decision", matched ? "accept" : "review");
        evidence.put("model_version", MODEL_VERSION);
        evidence.put("top_predictions", predictions);

        JSObject result = new JSObject();
        result.put("status", "success");
        result.put("matched", matched);
        result.put("model_version", MODEL_VERSION);
        result.put("inference_time_ms", (SystemClock.elapsedRealtimeNanos() - started) / 1_000_000.0);
        result.put("delegate_used", "cpu");
        result.put("candidates", candidates);
        result.put("ml_visual_evidence", evidence);
        result.put("notice", matched
                ? "On-device botanical candidate generated offline. Similarity is not a scientific verification."
                : "The local model did not reach the configured similarity threshold. The result is uncertain.");
        return result;
    }

    private float[] normalize(float[] vector) {
        double sum = 0d;
        for (float value : vector) {
            if (Float.isNaN(value) || Float.isInfinite(value)) throw new IllegalStateException("The model returned a non-finite embedding.");
            sum += value * (double) value;
        }
        double norm = Math.sqrt(sum);
        if (norm <= 0d || Double.isNaN(norm) || Double.isInfinite(norm)) {
            throw new IllegalStateException("The model returned an empty embedding.");
        }
        float[] normalized = new float[vector.length];
        for (int i = 0; i < vector.length; i++) normalized[i] = (float) (vector[i] / norm);
        return normalized;
    }

    private float cosine(float[] left, float[] right) {
        float score = 0f;
        for (int i = 0; i < left.length; i++) score += left[i] * right[i];
        return Math.max(-1f, Math.min(1f, score));
    }

    private static final class Match {
        final JSONObject entry;
        final float score;
        Match(JSONObject entry, float score) { this.entry = entry; this.score = score; }
    }

    @Override
    protected void handleOnDestroy() {
        synchronized (inferenceLock) {
            if (interpreter != null) interpreter.close();
            interpreter = null;
            referenceCatalog = null;
            mappedModel = null;
        }
        executor.shutdownNow();
        super.handleOnDestroy();
    }
}
