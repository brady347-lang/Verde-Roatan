// Pure helpers for live GPS boundary tracking. Kept free of React/Capacitor imports so they can be
// unit tested with plain Node (see gpsTracking.test.mjs). All coordinates stay on the device.

export type TrackPoint = { lat: number; lon: number; accuracy: number };

// A phone fix worse than 5 m is not suitable for drawing a small property boundary.
// This is a quality gate, not a claim of survey-grade accuracy.
export const MAX_ACCEPTED_ACCURACY_M = 5;
export const MIN_POINT_SPACING_M = 2.5;
// A person walking or jogging a boundary will not exceed this; faster implies a GPS jump.
export const MAX_WALK_SPEED_MPS = 6;
const EARTH_MEAN_RADIUS_M = 6371008.8;
const WGS84_A = 6378137;
const WGS84_E2 = 6.69437999014e-3;

export const toRadians = (value: number) => value * Math.PI / 180;

/** Great-circle distance on the mean Earth sphere (stable for short field edges and antimeridian crossings). */
export function distanceMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const dLat = lat2 - lat1;
  const dLon = toRadians(b.lon - a.lon);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const haversine = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * EARTH_MEAN_RADIUS_M * Math.atan2(Math.sqrt(haversine), Math.sqrt(Math.max(0, 1 - haversine)));
}

export type FixDecision =
  | { accept: true }
  | { accept: false; reason: 'invalid' | 'inaccurate' | 'duplicate' | 'jump' | 'stale' };

export type Fix = { lat: number; lon: number; accuracy: number; timestamp?: number };

/**
 * Decide whether a raw GPS fix should become a boundary point.
 * `previous` is the last accepted point (with the timestamp of the fix that produced it, if known).
 */
export function evaluateFix(previous: (TrackPoint & { timestamp?: number }) | undefined, fix: Fix): FixDecision {
  if (![fix.lat, fix.lon, fix.accuracy].every(Number.isFinite)
    || Math.abs(fix.lat) > 90 || Math.abs(fix.lon) > 180 || fix.accuracy <= 0) {
    return { accept: false, reason: 'invalid' };
  }
  if (fix.accuracy > MAX_ACCEPTED_ACCURACY_M) return { accept: false, reason: 'inaccurate' };
  if (!previous) return { accept: true };
  if (previous.timestamp !== undefined && fix.timestamp !== undefined && fix.timestamp <= previous.timestamp) {
    return { accept: false, reason: 'stale' };
  }
  const distance = distanceMeters(previous, fix);
  // Do not turn sub-uncertainty GPS jitter into extra boundary vertices. As reported
  // uncertainty grows, require a little more displacement before recording a point.
  const uncertaintySpacing = (previous.accuracy + fix.accuracy) * 0.35;
  if (distance < Math.max(MIN_POINT_SPACING_M, uncertaintySpacing)) return { accept: false, reason: 'duplicate' };
  if (previous.timestamp !== undefined && fix.timestamp !== undefined) {
    const seconds = (fix.timestamp - previous.timestamp) / 1000;
    if (distance / seconds > MAX_WALK_SPEED_MPS) return { accept: false, reason: 'jump' };
  }
  return { accept: true };
}

export function measurePolygon(points: TrackPoint[]): { area: number; perimeter: number } {
  if (points.length < 3) return { area: 0, perimeter: 0 };

  // Project the small field around its centroid onto a WGS84 local tangent plane.
  // Meridional and prime-vertical radii account for Earth's ellipsoidal shape; using
  // raw degrees or a fixed metres-per-degree constant creates latitude-dependent bias.
  const lat0 = toRadians(points.reduce((sum, point) => sum + point.lat, 0) / points.length);
  // Circular mean: an arithmetic mean of +179.99996 and -179.99997 is ~0 and would make a tiny plot span the globe.
  const lon0 = Math.atan2(
    points.reduce((sum, point) => sum + Math.sin(toRadians(point.lon)), 0),
    points.reduce((sum, point) => sum + Math.cos(toRadians(point.lon)), 0)
  ) * 180 / Math.PI;
  const sinLat = Math.sin(lat0);
  const denominator = Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  const primeVerticalRadius = WGS84_A / denominator;
  const meridionalRadius = WGS84_A * (1 - WGS84_E2) / (denominator ** 3);
  const meanLatDegrees = points.reduce((sum, point) => sum + point.lat, 0) / points.length;
  const xy = points.map((point) => {
    // Normalize longitude delta so a small plot crossing ±180° remains local.
    const deltaLon = ((point.lon - lon0 + 540) % 360) - 180;
    return {
      x: toRadians(deltaLon) * primeVerticalRadius * Math.cos(lat0),
      y: toRadians(point.lat - meanLatDegrees) * meridionalRadius
    };
  });

  let twiceArea = 0;
  let perimeter = 0;
  xy.forEach((point, index) => {
    const next = xy[(index + 1) % xy.length];
    twiceArea += point.x * next.y - next.x * point.y;
    perimeter += distanceMeters(points[index], points[(index + 1) % points.length]);
  });
  return { area: Math.abs(twiceArea) / 2, perimeter };
}

function orientation(ax: number, ay: number, bx: number, by: number, cx: number, cy: number) {
  const value = (by - ay) * (cx - bx) - (bx - ax) * (cy - by);
  if (Math.abs(value) < 1e-12) return 0;
  return value > 0 ? 1 : 2;
}

function onSegment(ax: number, ay: number, bx: number, by: number, px: number, py: number) {
  return px <= Math.max(ax, bx) + 1e-12 && px >= Math.min(ax, bx) - 1e-12
    && py <= Math.max(ay, by) + 1e-12 && py >= Math.min(ay, by) - 1e-12;
}

function segmentsIntersect(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }, d: { x: number; y: number }) {
  const o1 = orientation(a.x, a.y, b.x, b.y, c.x, c.y);
  const o2 = orientation(a.x, a.y, b.x, b.y, d.x, d.y);
  const o3 = orientation(c.x, c.y, d.x, d.y, a.x, a.y);
  const o4 = orientation(c.x, c.y, d.x, d.y, b.x, b.y);
  if (o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0 && o1 !== o2 && o3 !== o4) return true;
  return (o1 === 0 && onSegment(a.x, a.y, b.x, b.y, c.x, c.y))
    || (o2 === 0 && onSegment(a.x, a.y, b.x, b.y, d.x, d.y))
    || (o3 === 0 && onSegment(c.x, c.y, d.x, d.y, a.x, a.y))
    || (o4 === 0 && onSegment(c.x, c.y, d.x, d.y, b.x, b.y));
}

/**
 * True when the closed boundary crosses or overlaps itself (e.g. a figure-eight walk).
 * Coordinates are projected locally with wrapped longitude so antimeridian plots work too.
 */
export function hasSelfIntersection(points: Array<{ lat: number; lon: number }>): boolean {
  const n = points.length;
  if (n < 4) return false;
  const meanLat = toRadians(points.reduce((sum, point) => sum + point.lat, 0) / n);
  const sinLon = points.reduce((sum, point) => sum + Math.sin(toRadians(point.lon)), 0);
  const cosLon = points.reduce((sum, point) => sum + Math.cos(toRadians(point.lon)), 0);
  const lon0 = Math.atan2(sinLon, cosLon) * 180 / Math.PI;
  const projected = points.map(point => ({
    x: toRadians(((point.lon - lon0 + 540) % 360) - 180) * Math.cos(meanLat),
    y: toRadians(point.lat)
  }));
  for (let i = 0; i < n; i += 1) {
    const a = projected[i];
    const b = projected[(i + 1) % n];
    for (let j = i + 1; j < n; j += 1) {
      // Skip edges that share a vertex with edge i, including first/last adjacency.
      if ((j + 1) % n === i || (i + 1) % n === j) continue;
      const c = projected[j];
      const d = projected[(j + 1) % n];
      if (segmentsIntersect(a, b, c, d)) return true;
    }
  }
  return false;
}

export type GpsErrorKind = 'permission_denied' | 'precise_required' | 'services_disabled' | 'timeout' | 'unavailable' | 'unknown';

/** Classify a geolocation error message (Capacitor Android or browser) so the UI can give a specific fix. */
export function classifyGpsError(message: string | undefined | null): GpsErrorKind {
  const text = (message || '').toLowerCase();
  if (text.includes('location_precise_required')) return 'precise_required';
  if (text.includes('location_permission_denied') || /permission.*(denied|not granted)|denied.*permission|user denied/.test(text)) return 'permission_denied';
  if (/location services?.*(not enabled|disabled|off|turned off)|location (is )?(disabled|turned off|not enabled)|gps.*(disabled|off)|provider.*disabled/.test(text)) return 'services_disabled';
  if (text.includes('timeout') || text.includes('timed out')) return 'timeout';
  if (text.includes('unavailable') || text.includes('position_unavailable')) return 'unavailable';
  return 'unknown';
}

/** Coarse location alone cannot meet the accuracy needed to trace a boundary. */
export function hasPreciseLocation(permission: { location?: string; coarseLocation?: string }): boolean {
  return permission.location === 'granted';
}
