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
const lightChart = read('../components/LightHistoryChart.tsx');
const lightStore = read('../lib/lightHistoryStore.ts');
const shop = read('../screens/ShopScreen.tsx');
const app = read('../App.tsx');

// Permissions: without CAMERA in the merged manifest Android never shows a camera prompt.
for (const permission of ['CAMERA', 'ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION']) {
  assert.match(manifest, new RegExp(`uses-permission android:name="android.permission.${permission}"`), `${permission} must be declared`);
}
// Camera and light sensor must stay optional so devices without them can still install the app.
assert.match(manifest, /android.hardware.camera"\s+android:required="false"/);
assert.match(manifest, /android.hardware.sensor.light"\s+android:required="false"/);

// The native plugin emits lightSensorError on a failed resume; the bridge must declare it and the UI must listen.
// Android light-sensor diagnostics must distinguish missing hardware from a sensor that starts but never emits.
assert.match(plugin, /getAmbientLightSensorInfo/);
assert.match(plugin, /payload\.put\("available", lightSensor != null\)/);
assert.match(bridge, /getAmbientLightSensorInfo\(\): Promise/);
assert.match(tools, /getAmbientLightSensorInfo\(\)/);
assert.match(tools, /sensorInfo\.available/);
assert.match(tools, /Ambient-light sensor unavailable/);
assert.match(tools, /produced no readings within 6 seconds/);

// Light and compass share one listener, so stopping one must not unregister the other.
assert.match(plugin, /unregisterListener\(this, lightSensor\)/);
assert.match(plugin, /unregisterListener\(this, rotationSensor\)/);
assert.match(plugin, /handleOnPause\(\)[\s\S]*unregisterListener\(this, lightSensor\)[\s\S]*unregisterListener\(this, rotationSensor\)/, 'pause must release each sensor independently');
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
assert.match(tools, /RootWiseMap points=\{points\} follow=\{tracking\}/, 'RootWise open map must receive the live track and follow state');
const rootWiseMap = read('../components/RootWiseMap.tsx');
const fieldPlotDiagram = read('../components/FieldPlotDiagram.tsx');
assert.match(fieldPlotDiagram, /useState\(2\)/, 'field plot detail zoom must have a usable default');
assert.match(fieldPlotDiagram, /Math\.max\(1, value - 1\)/, 'field plot detail zoom must have a lower bound');
assert.match(fieldPlotDiagram, /Math\.min\(5, value \+ 1\)/, 'field plot detail zoom must have an upper bound');
assert.match(fieldPlotDiagram, /translate\(\$\{width \/ 2\} \$\{height \/ 2\}\) scale\(\$\{detailZoom\}\)/, 'detail zoom must magnify around the latest GPS point');
assert.match(fieldPlotDiagram, /Full plot overview|Vista general/, 'full plot overview must remain available beside the close-up');
assert.match(fieldPlotDiagram, /areaM2\.toFixed\(2\)/, 'area summary must remain based on the complete plot, not the zoom');
assert.match(fieldPlotDiagram, /Precision close-up|Zoom de precisión/, 'field plot must provide a separate precision close-up');
assert.match(rootWiseMap, /tiles\.openfreemap\.org\/styles\/liberty/, 'field map must use the OpenStreetMap-derived open vector basemap');
assert.match(rootWiseMap, /map\.easeTo\(\{ center: \[latest\.lon, latest\.lat\]/, 'MapLibre must follow the latest accepted GPS point');
assert.match(rootWiseMap, /rootwise-field-area/);
assert.match(rootWiseMap, /rootwise-field-boundary/);
assert.match(tools, /evaluateFix\(previousPoint, \{ lat: latitude, lon: longitude, accuracy, timestamp: Date\.now\(\) \}\)/, 'manual GPS points must pass accuracy and duplicate filtering');
assert.match(tools, /gpsFirstFixTimeoutRef/, 'GPS must report when no first fix arrives');
assert.match(tools, /GPS connected · waiting for the first location/, 'tracking must not claim live GPS before a fix');
assert.match(tools, /50000/, 'the first-fix wait must have a bounded feedback timeout');
for (const fragment of [
  'minimumUpdateInterval: 500',
  'Geolocation.getCurrentPosition(',
  "setAreaView('plot')",
  'FieldPlotDiagram points={points}',
  "recordLightReading(rawValue, 'sensor_measured', displayValue)",
  'saveLightReading(sample)',
  'lightSamples.filter'
]) assert.ok(tools.includes(fragment), `missing field capture behavior: ${fragment}`);
assert.match(tools, /cameraRequestGenerationRef/, 'late camera permission results must be invalidated when the tool is stopped');
assert.match(tools, /requestGeneration !== cameraRequestGenerationRef\.current/, 'stopped camera requests must not reactivate a stream');
assert.doesNotMatch(tools, /luxInput/, 'ordinary light readings must not require manual lux entry');

// Shop must expose a direct, visible route to the existing cart and delivery checkout.
assert.match(shop, /ShoppingBag/);
assert.match(shop, /onOpenCart/);
assert.match(shop, /cartCount > 0/);
assert.match(app, /onOpenCart=\{\(\) => setTab\('request'\)\}/);

// Light sensor diagnostics and stabilized display (ported from PR #64 onto the newer light pipeline).
assert.match(plugin, /payload\.put\("sensorName"/, 'native plugin must report the sensor name');
assert.match(plugin, /payload\.put\("resolution"/, 'native plugin must report sensor resolution');
assert.match(bridge, /sensorVendor\?: string/, 'bridge typing must expose sensor diagnostics');
assert.match(tools, /luxFilterRef\.current\.push\(rawValue\)/, 'native light display must be stabilized');
assert.match(tools, /recordLightReading\(rawValue, 'sensor_measured', displayValue\)/, 'light history chart must use the same filtered value shown in the live display');
assert.match(tools, /rawLux: Math\.max\(0, luxValue\)/, 'unfiltered lux must remain available for diagnostics');
assert.match(lightStore, /rawLux\?: number/, 'history must preserve raw sensor values separately');
assert.match(lightChart, /const yMin = 0/, 'lux chart vertical axis must start at zero to avoid exaggerated visual differences');
assert.match(lightChart, /Smoothed lux to match the main reading/, 'chart must explain that plotted values match the smoothed live reading');
assert.ok(tools.includes('estimateLuxFromCamera('), 'main calibrated camera estimates must remain');
assert.ok(tools.includes('buildCalibrationProfile('), 'camera calibration flow must remain');

console.log('androidWiring tests passed');

// Compass must be backed by Android's rotation-vector sensor and expose live readings.
assert.match(plugin, /Sensor\.TYPE_ROTATION_VECTOR/);
assert.match(plugin, /notifyListeners\("compassReading"/);
assert.match(bridge, /startCompass\(\): Promise<void>/);
assert.match(bridge, /addListener\(eventName: 'compassReading'/);
assert.match(tools, /startCompassSensor/);
assert.match(tools, /compassCalibrationScore/);
assert.match(tools, /distanceOriginRef/);
assert.match(tools, /gpsDistanceMeters\(distanceOriginRef\.current, liveFix\)/);
assert.match(tools, /liveFix\.accuracy > 5/);

// Opt-in GPS diagnostics must remain local, bounded, exportable, and include rejected raw fixes.
const gpsDiagnostics = read('../lib/gpsDiagnosticsStore.ts');
assert.match(gpsDiagnostics, /rootwise-gps-diagnostics/);
assert.match(gpsDiagnostics, /MAX_SAMPLES = 20000/);
assert.match(gpsDiagnostics, /saveGpsDiagnosticsSample/);
assert.match(gpsDiagnostics, /listGpsDiagnosticsSamples/);
assert.match(gpsDiagnostics, /deleteGpsDiagnosticsSamples/);
assert.match(tools, /gpsDiagnosticsEnabledRef\.current/);
assert.match(tools, /accepted: decision\.accept/);
assert.match(tools, /rejectionReason: decision\.reason/);
assert.match(tools, /Export JSON|Exportar JSON/);
assert.match(tools, /Nothing is uploaded automatically|No se sube nada automáticamente/);


// RootWise native botanical ML bridge: the Android model must run locally only when
// both the trained model and a model-aligned, provenance-bearing catalog are present.
const mlBridge = read('../../capacitor-plugins/rootwise-botanical-ml/index.ts');
const mlPlugin = read('../../capacitor-plugins/rootwise-botanical-ml/android/src/main/java/com/rootwise/botanicalml/RootWiseBotanicalMLPlugin.java');
const mlService = read('./localBotanicalMl.ts');
const apiService = read('./api.ts');
const rootPackage = JSON.parse(read('../../package.json'));
assert.equal(rootPackage.dependencies['@rootwise/botanical-ml'], 'file:./capacitor-plugins/rootwise-botanical-ml');
assert.match(mlBridge, /registerPlugin<RootWiseBotanicalMLPlugin>\('RootWiseBotanicalML'\)/);
assert.match(mlPlugin, /@CapacitorPlugin\(name = "RootWiseBotanicalML"\)/);
assert.match(mlPlugin, /interpreter\.run\(input, output\)/, 'native path must execute the real LiteRT interpreter');
assert.match(mlPlugin, /getInputTensor\(0\)\.dataType\(\) != DataType\.FLOAT32/);
assert.match(mlPlugin, /new int\[\]\{1, INPUT_HEIGHT, INPUT_WIDTH, 3\}/);
assert.match(mlPlugin, /new int\[\]\{1, EMBEDDING_DIMENSION\}/);
assert.match(mlPlugin, /MODEL_VERSION = "mobilenetv4_512d_v1"/);
assert.match(mlPlugin, /source_id/);
assert.match(mlPlugin, /referenceCatalogReady/);
assert.match(mlPlugin, /result\.put\("ready", modelReady && catalogReady && runtimeReady\)/);
assert.match(mlService, /Capacitor\.isNativePlatform\(\)/);
assert.match(mlService, /if \(!readiness\.ready\) return null/);
assert.match(apiService, /tryLocalBotanicalIdentification\(base64Image\)/);
assert.match(apiService, /if \(localResult\?\.matched\) return localResult/);
assert.match(apiService, /retain the local uncertain candidate/);
assert.match(apiService, /mode === 'plant'/);
