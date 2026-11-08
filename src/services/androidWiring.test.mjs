// Source-level regression guards for native wiring that cannot be exercised without a device.
// These do NOT prove the sensors or permission prompts work on a phone; they stop the specific
// wiring mistakes found in review from silently coming back.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const manifest = read('../../capacitor-plugins/rootwise-device-sensors/android/src/main/AndroidManifest.xml');
const bridge = read('../../capacitor-plugins/rootwise-device-sensors/index.ts');
const plugin = read('../../capacitor-plugins/rootwise-device-sensors/android/src/main/java/com/rootwise/devicesensors/RootWiseDeviceSensorsPlugin.java');
const tools = read('../screens/ToolsScreen.tsx');

// Permissions: without CAMERA in the merged manifest Android never shows a camera prompt.
for (const permission of ['CAMERA', 'ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION']) {
  assert.match(manifest, new RegExp(`uses-permission android:name="android.permission.${permission}"`), `${permission} must be declared`);
}
// Camera and light sensor must stay optional so devices without them can still install the app.
assert.match(manifest, /android.hardware.camera"\s+android:required="false"/);
assert.match(manifest, /android.hardware.sensor.light"\s+android:required="false"/);

// The native plugin emits lightSensorError on a failed resume; the bridge must declare it and the UI must listen.
assert.match(plugin, /notifyListeners\("lightSensorError"/);
assert.match(bridge, /addListener\(eventName: 'lightSensorError'/);
assert.match(tools, /addListener\('lightSensorError'/);
assert.match(tools, /errorListener\.remove\(\)/, 'the error listener must be removed on stop and on failed start');

// Lifecycle: pause releases the sensor and resume re-registers only if the user still wants readings.
assert.match(plugin, /handleOnPause\(\)[\s\S]*unregisterListener\(this\)[\s\S]*listening = false/);
assert.match(plugin, /handleOnResume\(\)[\s\S]*shouldListen && !registerAmbientLightListener\(\)/);
assert.match(plugin, /handleOnDestroy\(\)[\s\S]*unregisterListener\(this\)/);

// GPS tracking safeguards in the screen.
assert.match(tools, /tool !== 'area' && trackingActiveRef\.current/, 'tracking must stop when leaving the area tool');
assert.match(tools, /hasPreciseLocation\(permission\)/, 'coarse-only permission must not start tracking');
assert.doesNotMatch(tools, /permission\.coarseLocation !== 'granted'\) permission = await/, 'old coarse-accepting check must not return');
assert.match(tools, /disabled=\{tracking\} onClick=\{\(\) => setPoints/, 'undo must be disabled while tracking');
assert.match(tools, /if \(!trackingActiveRef\.current\) \{[\s\S]*?clearWatch\(\{ id: watchId \}\)[\s\S]*?return;/, 'stop during watcher start must release the watcher and not re-enter tracking state');
assert.match(tools, /map\.panTo\(\[latest\.lat, latest\.lon\]/, 'live map must follow the latest GPS point');
assert.match(tools, /MapViewport points=\{points\} follow=\{tracking\}/, 'map follow mode must be tied to active tracking');
assert.match(tools, /evaluateFix\(previousPoint, \{ lat: latitude, lon: longitude, accuracy, timestamp: Date\.now\(\) \}\)/, 'manual GPS points must pass accuracy and duplicate filtering');

// Light measurements must come from the device sensor, never user-entered lux values.
assert.doesNotMatch(tools, /luxInput|Lux measured with a lux meter|Lectura de luz \\(lux\\)/, 'manual lux entry must not be exposed');
assert.match(tools, /RootWiseDeviceSensors\\.addListener\\('lightReading'/, 'live lux must come from the native device sensor');
assert.match(tools, /hasLiveLux \\? <>/, 'light guidance must wait until a real sensor reading exists');
assert.match(tools, /Recommendations will appear automatically when a real sensor reading is received/, 'plant recommendations must wait for real sensor data');
assert.match(tools, /getUserMedia\(/, 'camera fallback must request a live camera stream');
assert.match(tools, /estimateCameraBrightness\(/, 'camera frames must be analyzed for relative brightness');
assert.match(tools, /Camera brightness estimate/, 'camera measurements must be clearly labeled as estimates');
assert.match(tools, /startCameraFallback\(\)/, 'camera fallback must start when the ambient sensor is unavailable');

console.log('androidWiring tests passed');
