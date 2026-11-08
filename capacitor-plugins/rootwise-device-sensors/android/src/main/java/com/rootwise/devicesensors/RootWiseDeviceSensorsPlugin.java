package com.rootwise.devicesensors;

import android.content.Context;
import android.content.Intent;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "RootWiseDeviceSensors")
public class RootWiseDeviceSensorsPlugin extends Plugin implements SensorEventListener {
    private SensorManager sensorManager;
    private Sensor lightSensor;
    private boolean listening = false;
    private boolean shouldListen = false;

    private boolean registerAmbientLightListener() {
        if (sensorManager == null) {
            sensorManager = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        }
        if (sensorManager == null) return false;
        lightSensor = sensorManager.getDefaultSensor(Sensor.TYPE_LIGHT);
        if (lightSensor == null) return false;
        if (listening) return true;
        listening = sensorManager.registerListener(this, lightSensor, SensorManager.SENSOR_DELAY_UI);
        return listening;
    }

    @PluginMethod
    public void startAmbientLight(PluginCall call) {
        shouldListen = true;
        if (!registerAmbientLightListener()) {
            shouldListen = false;
            if (sensorManager == null) {
                call.reject("Android sensor service is unavailable.");
            } else if (lightSensor == null) {
                call.reject("This device does not expose an ambient light sensor.");
            } else {
                call.reject("Android could not start the ambient light sensor.");
            }
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void stopAmbientLight(PluginCall call) {
        if (sensorManager != null && listening) {
            sensorManager.unregisterListener(this);
        }
        listening = false;
        shouldListen = false;
        call.resolve();
    }

    @PluginMethod
    public void openLocationSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("Unable to open Android Location settings.", error);
        }
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (event == null || event.sensor.getType() != Sensor.TYPE_LIGHT || event.values.length == 0) return;
        JSObject payload = new JSObject();
        payload.put("lux", Math.max(0, event.values[0]));
        payload.put("accuracy", event.accuracy);
        payload.put("sensorName", event.sensor.getName());
        payload.put("sensorVendor", event.sensor.getVendor());
        payload.put("maximumRange", event.sensor.getMaximumRange());
        payload.put("resolution", event.sensor.getResolution());
        notifyListeners("lightReading", payload);
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) { }

    @Override
    protected void handleOnPause() {
        if (sensorManager != null && listening) sensorManager.unregisterListener(this);
        listening = false;
        super.handleOnPause();
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        if (shouldListen && !registerAmbientLightListener()) {
            JSObject payload = new JSObject();
            payload.put("message", "Ambient light sensor could not resume.");
            notifyListeners("lightSensorError", payload);
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (sensorManager != null) sensorManager.unregisterListener(this);
        listening = false;
        shouldListen = false;
        super.handleOnDestroy();
    }
}
