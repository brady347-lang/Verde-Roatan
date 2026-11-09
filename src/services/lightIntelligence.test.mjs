import assert from 'node:assert/strict';
import { assessLight, recommendPlantsForLight } from './lightIntelligence.ts';

assert.equal(assessLight(0).band, 'deep_shade');
assert.equal(assessLight(500).band, 'low_light');
assert.equal(assessLight(5000).band, 'bright_indirect');
assert.equal(assessLight(18000).band, 'partial_sun');
assert.equal(assessLight(40000).band, 'full_sun');
assert.equal(assessLight(Number.NaN).lux, 0);
assert.ok(recommendPlantsForLight(18000).every(match => match.fit === 'strong' || match.fit === 'possible'));
console.log('Light intelligence tests passed.');
