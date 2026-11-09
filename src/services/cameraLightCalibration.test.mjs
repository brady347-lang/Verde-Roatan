import assert from 'node:assert/strict';
import { buildCalibrationProfile, estimateLuxFromCamera, normalizeCameraResponse, summarizeFrame } from './cameraLightCalibration.ts';

assert.equal(normalizeCameraResponse(255, 255, 255), 1);
assert.equal(normalizeCameraResponse(0, 0, 0), 0);
const pixels = new Uint8ClampedArray([0,0,0,255, 255,255,255,255, 128,128,128,255, 128,128,128,255]);
assert.ok(summarizeFrame(pixels) > 0.3 && summarizeFrame(pixels) < 0.8);
const stages = [
  { stage: 'dark', response: 0.01, referenceLux: 0.5, capturedAt: '2026-11-08T00:00:00Z' },
  { stage: 'shade', response: 0.08, referenceLux: 100, capturedAt: '2026-11-08T00:00:10Z' },
  { stage: 'indirect', response: 0.3, referenceLux: 1000, capturedAt: '2026-11-08T00:00:20Z' },
  { stage: 'bright', response: 0.8, referenceLux: 10000, capturedAt: '2026-11-08T00:00:30Z' }
];
const profile = buildCalibrationProfile('pixel-test', [...stages]);
assert.equal(profile.quality, 'reference_calibrated');
const estimate = estimateLuxFromCamera(0.3, profile);
assert.ok(estimate && Math.abs(estimate.lux - 1000) < 0.001);
assert.equal(estimate?.confidence, 'moderate');
// Halfway through camera response between 100 and 1,000 lux should be a geometric,
// not arithmetic, midpoint because the calibration spans an order of magnitude.
const midRange = estimateLuxFromCamera(0.19, profile);
assert.ok(midRange && Math.abs(midRange.lux - Math.sqrt(100 * 1000)) < 0.001);
assert.equal(estimateLuxFromCamera(0.01, profile)?.confidence, 'low');
assert.throws(() => buildCalibrationProfile('bad', [
  { ...stages[0], response: 0.2 }, { ...stages[1], response: 0.1 }, stages[2], stages[3]
]));
const relative = buildCalibrationProfile('relative', stages.map(({ referenceLux, ...sample }) => sample));
assert.equal(relative.quality, 'relative_only');
assert.equal(estimateLuxFromCamera(0.3, relative), null);
console.log('Camera light calibration tests passed.');
