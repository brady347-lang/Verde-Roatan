import assert from 'node:assert/strict';
import { LuxReadingFilter } from './luxReadingFilter.ts';

const filter = new LuxReadingFilter(5, 0.35);
assert.equal(filter.push(40), 40);
const smoothed = filter.push(45);
assert.ok(smoothed > 40 && smoothed < 45, 'display value should ease toward the new median');
const afterSpike = filter.push(500);
assert.ok(afterSpike < 100, 'a single sensor spike must not dominate the displayed value');
assert.throws(() => filter.push(Number.NaN), /finite non-negative/i);
assert.throws(() => filter.push(-1), /finite non-negative/i);
filter.reset();
assert.equal(filter.push(39), 39, 'reset must clear prior samples and filter state');
console.log('Lux reading filter tests passed.');
