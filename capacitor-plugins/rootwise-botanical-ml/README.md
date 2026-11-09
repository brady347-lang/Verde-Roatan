# RootWise Botanical ML — Capacitor Android bridge

This is an Android-native plugin for the existing RootWise Capacitor app. It does not create a second application, replace the React Identify screen, or modify the separate Google AI Studio engine.

## Runtime contract

The plugin exposes:

- `getReadiness()`: reports whether both the trained model and its compatible local reference catalog are installed.
- `identify({ image, topK, confidenceThreshold })`: decodes the image, runs LiteRT inference on-device, and performs cosine-similarity search against the local reference catalog.

The plugin uses the Android CPU delegate with four LiteRT threads. It does not claim GPU/NPU acceleration. Model or catalog absence is a not-ready state, not a guessed result. The existing app then continues through its existing remote analysis path.

## Required Android assets

Place both files in the plugin module assets directory:

`capacitor-plugins/rootwise-botanical-ml/android/src/main/assets/`

1. `botanical_mobilenetv4_512d.tflite`
2. `botanical_reference_embeddings.json`

The current repository intentionally does not contain either artifact. Do not add synthetic/random embeddings.

### Model contract

- Input: FLOAT32 `[1, 224, 224, 3]`, RGB, values normalized to [-1, 1].
- Output: FLOAT32 `[1, 512]`.
- Model version: `mobilenetv4_512d_v1`.

The model contract must be confirmed against the actual AI Studio export before installing a model. If the exported model differs, update this adapter to match the real contract; do not reshape or reinterpret tensors speculatively.

### Reference catalog schema

The JSON asset must follow this structure (the `embedding` array is abbreviated here; the real file must contain exactly 512 finite numeric values per entry):

```typescript
type BotanicalReferenceCatalog = {
  model_version: "mobilenetv4_512d_v1";
  embedding_dimension: 512;
  normalization: "minus_one_to_one";
  entries: Array<{
    id: string;
    common_name: string;
    scientific_name: string;
    family: string;
    source_id: string;
    expert_verified: boolean;
    verification_source?: string;
    embedding: number[]; // exactly 512 values
  }>;
};
```

Every entry needs a traceable `source_id`. If `expert_verified` is true, the catalog must also provide a non-empty `verification_source`; the native plugin rejects unsupported verification claims. The current UI adapter does not convert similarity into scientific verification.

## Install into the existing app

The root project declares this local package as `@rootwise/botanical-ml`. Run:

```bash
npm install
npx cap sync android
```

Then build/test the generated Android project on a real device. The app ID remains `com.verderoatan.plantintelligence`.

## Safety and current limitations

- This plugin handles botanical plant mode only. Pest analysis remains on the existing service.
- No model or reference catalog is bundled in this repository yet.
- An uncertain local result may be enriched by the existing remote worker; if the worker is offline, the local uncertain result is retained.
- The local result is a candidate, not a verified botanical record.
- This adapter has not yet been compiled against the generated Android project or exercised on a device.
