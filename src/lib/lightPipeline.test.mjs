import assert from 'node:assert/strict';
import * as lp from './lightPipeline.ts';

assert.equal(lp.bandForLux(50), 'deep_shade'); assert.equal(lp.bandForLux(500), 'low_light');
assert.equal(lp.bandForLux(5000), 'bright_indirect'); assert.equal(lp.bandForLux(18000), 'partial_sun');
assert.equal(lp.bandForLux(40000), 'full_sun'); assert.equal(lp.bandForLux(NaN), 'deep_shade');

const verified = { value: 'full_sun', provenance: 'source_supported', evidenceRefs: ['hibiscus'] };
const sensor = lp.interpretLight({ lux: 40000, method: 'sensor_measured' }, verified);
assert.equal(sensor.provenance, 'sensor_measured'); assert.equal(sensor.value.fit, 'matches'); assert.equal(sensor.value.measured, true);
assert.match(sensor.value.summary, /^Measured/);
const cam = lp.interpretLight({ lux: 40000, method: 'camera_estimated' }, verified);
assert.match(cam.value.summary, /^Estimated/); assert.ok(cam.confidence <= 0.4); assert.ok(cam.caveats.some(c => /not equivalent/.test(c)));
assert.ok(cam.confidence < sensor.confidence);

// Mismatch gives a direction; unverified requirement lowers confidence and warns
const low = lp.interpretLight({ lux: 300, method: 'sensor_measured' }, { value: 'full_sun', provenance: 'model_prediction' });
assert.equal(low.value.fit, 'mismatch'); assert.equal(low.value.direction, 'increase_light');
assert.ok(low.confidence <= 0.5); assert.ok(low.caveats.some(c => /not yet verified/.test(c)));
const bright = lp.interpretLight({ lux: 40000, method: 'sensor_measured' }, { value: 'deep_shade', provenance: 'source_supported', evidenceRefs: ['x'] });
assert.equal(bright.value.direction, 'reduce_light');
// No plant => level only
const none = lp.interpretLight({ lux: 2000, method: 'sensor_measured' }, null);
assert.equal(none.value.fit, null); assert.ok(none.caveats.some(c => /not identified/.test(c)));
// Invalid readings never produce confidence
assert.equal(lp.interpretLight({ lux: -5, method: 'sensor_measured' }, null).confidence, 0);
assert.equal(lp.interpretLight({ lux: NaN, method: 'camera_estimated' }, null).confidence, 0);

// Profile requirement: unverified is never fact
assert.equal(lp.requirementCandidate({ id: 'a', is_verified: false, horticulture: { sunlight_requirements: 'full_sun' } }).provenance, 'model_prediction');
assert.equal(lp.requirementCandidate({ id: 'a', is_verified: true, horticulture: { sunlight_requirements: 'full_sun' } }).provenance, 'source_supported');
assert.equal(lp.requirementCandidate(null), null);
const picked = lp.resolveLightRequirement([lp.requirementCandidate({ id: 'a', is_verified: false, horticulture: { sunlight_requirements: 'full_sun' } }), lp.requirementCandidate({ id: 'b', is_verified: true, horticulture: { sunlight_requirements: 'partial_shade' } })]);
assert.equal(picked.chosen.value, 'partial_shade'); assert.equal(picked.disagreement, true);

// Calibration evaluation against professional readings
assert.equal(lp.evaluateCameraEstimates([{ estimatedLux: 1, referenceLux: 1 }]).trustworthy, false);
const good = [[100, 110], [1000, 900], [5000, 5200], [12000, 11000], [30000, 33000]].map(([e, r]) => ({ estimatedLux: e, referenceLux: r }));
assert.equal(lp.evaluateCameraEstimates(good).trustworthy, true);
const bad = [[100, 400], [1000, 5000], [5000, 900], [12000, 3000], [30000, 90000]].map(([e, r]) => ({ estimatedLux: e, referenceLux: r }));
assert.equal(lp.evaluateCameraEstimates(bad).trustworthy, false);
console.log('Light pipeline tests passed.');
