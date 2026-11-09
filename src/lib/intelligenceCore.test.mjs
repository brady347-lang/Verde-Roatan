import assert from 'node:assert/strict';
import * as core from './intelligenceCore.ts';

const src = { provider: 'rules' };
// Predictions can never claim verified confidence
const p = core.makeResult({ domain: 'identification', subject: 'hibiscus', value: 'x', confidence: 0.99, provenance: 'model_prediction', source: src });
assert.equal(p.confidence, 0.85); assert.equal(p.confidenceLabel, 'high');
// Camera estimates are capped
assert.equal(core.makeResult({ domain: 'light', subject: 's', value: 1, confidence: 1, provenance: 'camera_estimated', source: src }).confidence, 0.5);
// Verified without evidence is downgraded
const v = core.makeResult({ domain: 'care', subject: 's', value: 1, confidence: 1, provenance: 'verified_fact', source: src });
assert.equal(v.provenance, 'model_prediction'); assert.ok(v.caveats.length);
assert.equal(core.makeResult({ domain: 'care', subject: 's', value: 1, confidence: 1, provenance: 'verified_fact', source: src, evidenceRefs: ['k1'] }).confidence, 1);
// NaN confidence is safe
assert.equal(core.makeResult({ domain: 'care', subject: 's', value: 1, confidence: NaN, provenance: 'rule_derived', source: src }).confidence, 0);
// Labels never present prediction as fact
assert.match(core.provenanceLabel('model_prediction'), /not confirmed/);
assert.match(core.provenanceLabel('camera_estimated', 'es'), /Estimado/);

// resolveFact prefers verified over prediction and reports disagreement
const f = core.resolveFact([{ value: 'full_sun', provenance: 'model_prediction', confidence: 0.9 }, { value: 'partial_shade', provenance: 'source_supported', confidence: 0.6 }]);
assert.equal(f.chosen.value, 'partial_shade'); assert.equal(f.disagreement, true);
assert.equal(core.resolveFact([]).chosen, null);

// Conflicts: higher provenance wins and the other is suppressed
const r1 = core.resolveRecommendations([
  { id: 'a', topic: 'light', action: 'increase', text: 'more light', provenance: 'sensor_measured', confidence: 0.8 },
  { id: 'b', topic: 'light', action: 'decrease', text: 'less light', provenance: 'model_prediction', confidence: 0.8 },
  { id: 'c', topic: 'water', action: 'maintain', text: 'ok', provenance: 'rule_derived', confidence: 0.7 }
]);
assert.deepEqual(r1.accepted.map(r => r.id).sort(), ['a', 'c']); assert.equal(r1.suppressed[0].recommendation.id, 'b');
// Equal reliability => no advice, question instead
const r2 = core.resolveRecommendations([
  { id: 'a', topic: 'water', action: 'increase', text: '', provenance: 'model_prediction', confidence: 0.6 },
  { id: 'b', topic: 'water', action: 'decrease', text: '', provenance: 'model_prediction', confidence: 0.62 }
]);
assert.equal(r2.accepted.length, 0); assert.equal(r2.needsReview.length, 1);

// Privacy gate
const ok = { kind: 'light_calibration', consentedToShare: true, anonymized: true, approvedByReviewer: true, payload: { deviceModelClass: 'x', ratio: 1.1 } };
assert.equal(core.canEnterBotanicalMemory(ok).allowed, true);
assert.equal(core.canEnterBotanicalMemory({ ...ok, approvedByReviewer: false }).allowed, false);
assert.equal(core.canEnterBotanicalMemory({ ...ok, consentedToShare: false }).allowed, false);
assert.equal(core.canEnterBotanicalMemory({ ...ok, payload: { meta: { image_url: 'x' } } }).allowed, false);
assert.equal(core.canEnterBotanicalMemory({ ...ok, payload: { latitude: 1 } }).allowed, false);

// Feedback is never verified
const e = core.feedbackToEvidence({ subject: 'hibiscus', claim: 'wrong plant', kind: 'identification_correction' });
assert.equal(e.verification_status, 'community_submitted'); assert.equal(e.provenance, 'user_feedback_unverified');
console.log('Intelligence core tests passed.');
