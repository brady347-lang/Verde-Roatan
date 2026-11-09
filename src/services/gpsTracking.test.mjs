import assert from 'node:assert/strict';
import {
  MAX_ACCEPTED_ACCURACY_M,
  classifyGpsError,
  distanceMeters,
  evaluateFix,
  hasPreciseLocation,
  hasSelfIntersection,
  measurePolygon
} from './gpsTracking.ts';

// ~1 degree of latitude is 111,132 m; build a square by offsetting in meters near Roatan (16.3N).
const BASE = { lat: 16.3, lon: -86.5 };
const mPerLat = 111132.92;
const mPerLon = 111412.84 * Math.cos(BASE.lat * Math.PI / 180);
const at = (eastM, northM, accuracy = 5) => ({ lat: BASE.lat + northM / mPerLat, lon: BASE.lon + eastM / mPerLon, accuracy });

// --- distance / area / perimeter
assert.ok(Math.abs(distanceMeters(at(0, 0), at(30, 40)) - 50) < 0.5, 'distance 3-4-5 triangle');
const square = [at(0, 0), at(10, 0), at(10, 10), at(0, 10)];
const squareResult = measurePolygon(square);
assert.ok(Math.abs(squareResult.area - 100) < 0.5, `10x10 m square area ~100, got ${squareResult.area}`);
assert.ok(Math.abs(squareResult.perimeter - 40) < 0.2, `perimeter ~40, got ${squareResult.perimeter}`);
// Winding direction must not change the result.
const reversed = measurePolygon([...square].reverse());
assert.ok(Math.abs(reversed.area - squareResult.area) < 1e-6);
assert.deepEqual(measurePolygon(square.slice(0, 2)), { area: 0, perimeter: 0 });
assert.deepEqual(measurePolygon([]), { area: 0, perimeter: 0 });

// --- fix filtering
assert.equal(MAX_ACCEPTED_ACCURACY_M, 5, 'small boundary tracking must reject fixes worse than 5 m');
assert.deepEqual(evaluateFix(undefined, at(0, 0, 5)), { accept: true });
assert.deepEqual(evaluateFix(undefined, at(0, 0, MAX_ACCEPTED_ACCURACY_M + 1)), { accept: false, reason: 'inaccurate' });
assert.deepEqual(evaluateFix(undefined, at(0, 0, MAX_ACCEPTED_ACCURACY_M)), { accept: true }, '5 m boundary accuracy accepted');
assert.equal(evaluateFix(undefined, at(0, 0, MAX_ACCEPTED_ACCURACY_M + 0.1)).reason, 'inaccurate');
assert.equal(evaluateFix(undefined, { lat: NaN, lon: 0, accuracy: 5 }).reason, 'invalid');
assert.equal(evaluateFix(undefined, { lat: 95, lon: 0, accuracy: 5 }).reason, 'invalid');
assert.equal(evaluateFix(undefined, { lat: 0, lon: 200, accuracy: 5 }).reason, 'invalid');
assert.equal(evaluateFix(undefined, { lat: 0, lon: 0, accuracy: -1 }).reason, 'invalid');
assert.equal(evaluateFix(undefined, { lat: 0, lon: 0, accuracy: Infinity }).reason, 'invalid');
// Stationary jitter within 2.5 m is a duplicate; 3 m of real movement is accepted.
assert.equal(evaluateFix(at(0, 0), at(1, 1)).reason, 'duplicate');
assert.deepEqual(evaluateFix(at(0, 0), at(3, 0)), { accept: true });
assert.equal(evaluateFix(at(0, 0, 10), at(4, 0, 10)).reason, 'duplicate', 'large uncertainty must suppress sub-uncertainty jitter');
assert.deepEqual(evaluateFix(at(0, 0, 10), at(6, 0, 10)), { accept: true }, 'real movement beyond the uncertainty spacing is accepted');
// A 200 m jump one second later is a GPS glitch, not walking.
assert.equal(evaluateFix({ ...at(0, 0), timestamp: 1000 }, { ...at(200, 0), timestamp: 2000 }).reason, 'jump');
// The same distance after 100 s is plausible movement.
assert.deepEqual(evaluateFix({ ...at(0, 0), timestamp: 1000 }, { ...at(200, 0), timestamp: 101000 }), { accept: true });
// Without timestamps the jump guard is skipped rather than guessed.
assert.deepEqual(evaluateFix(at(0, 0), at(200, 0)), { accept: true });

// --- self-intersection
assert.equal(hasSelfIntersection(square), false);
assert.equal(hasSelfIntersection(square.slice(0, 3)), false, 'triangles cannot self-cross');
// Bow-tie (figure-eight) walk: edges (0,0)->(10,10) and (10,0)->(0,10) cross.
assert.equal(hasSelfIntersection([at(0, 0), at(10, 10), at(10, 0), at(0, 10)]), true);
// Concave L-shape does not cross itself.
assert.equal(hasSelfIntersection([at(0, 0), at(10, 0), at(10, 5), at(5, 5), at(5, 10), at(0, 10)]), false);

// --- error classification
assert.equal(classifyGpsError('LOCATION_PERMISSION_DENIED'), 'permission_denied');
assert.equal(classifyGpsError('LOCATION_PRECISE_REQUIRED'), 'precise_required');
assert.equal(classifyGpsError('User denied Geolocation'), 'permission_denied');
assert.equal(classifyGpsError('Location services are not enabled'), 'services_disabled');
assert.equal(classifyGpsError('location disabled'), 'services_disabled');
assert.equal(classifyGpsError('Timeout expired'), 'timeout');
assert.equal(classifyGpsError('Position unavailable'), 'unavailable');
assert.equal(classifyGpsError(''), 'unknown');
assert.equal(classifyGpsError(undefined), 'unknown');

// --- permission precision
assert.equal(hasPreciseLocation({ location: 'granted', coarseLocation: 'granted' }), true);
assert.equal(hasPreciseLocation({ location: 'denied', coarseLocation: 'granted' }), false, 'coarse only is not enough');
assert.equal(hasPreciseLocation({ location: 'prompt', coarseLocation: 'prompt' }), false);
assert.equal(hasPreciseLocation({}), false);

console.log('gpsTracking tests passed');
