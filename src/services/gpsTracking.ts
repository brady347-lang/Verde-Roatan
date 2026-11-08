// Pure helpers for live GPS boundary tracking. Kept free of React/Capacitor imports so they can be
// unit tested with plain Node (see gpsTracking.test.mjs). All coordinates stay on the device.

export type TrackPoint = { lat: number; lon: number; accuracy: number };

export const MAX_ACCEPTED_ACCURACY_M = 30;
export const MIN_POINT_SPACING_M = 2.5;
// A person walking or jogging a boundary will not exceed this; faster implies a GPS jump.
export const MAX_WALK_SPEED_MPS = 6;
const EARTH_RADIUS_M = 6371000;

export const toRadians = (value: number) => value * Math.PI / 180;

export function distanceMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const latMean = toRadians((a.lat + b.lat) / 2);
  const dx = toRadians(b.lon - a.lon) * EARTH_RADIUS_M * Math.cos(latMean);
  const dy = toRadians(b.lat - a.lat) * EARTH_RADIUS_M;
  return Math.hypot(dx, dy);
}

export type FixDecision =
  | { accept: true }
  | { accept: false; reason: 'invalid' | 'inaccurate' | 'duplicate' | 'jump' };

export type Fix = { lat: number; lon: number; accuracy: number; timestamp?: number };

/**
 * Decide whether a raw GPS fix should become a boundary point.
 * `previous` is the last accepted point (with the timestamp of the fix that produced it, if known).
 */
export function evaluateFix(previous: (TrackPoint & { timestamp?: number }) | undefined, fix: Fix): FixDecision {
  if (![fix.lat, fix.lon, fix.accuracy].every(Number.isFinite)
    || Math.abs(fix.lat) > 90 || Math.abs(fix.lon) > 180 || fix.accuracy < 0) {
    return { accept: false, reason: 'invalid' };
  }
  if (fix.accuracy > MAX_ACCEPTED_ACCURACY_M) return { accept: false, reason: 'inaccurate' };
  if (!previous) return { accept: true };
  const distance = distanceMeters(previous, fix);
  if (distance < MIN_POINT_SPACING_M) return { accept: false, reason: 'duplicate' };
  if (previous.timestamp !== undefined && fix.timestamp !== undefined) {
    const seconds = (fix.timestamp - previous.timestamp) / 1000;
    if (seconds > 0 && distance / seconds > MAX_WALK_SPEED_MPS) return { accept: false, reason: 'jump' };
  }
  return { accept: true };
}

export function measurePolygon(points: TrackPoint[]): { area: number; perimeter: number } {
  if (points.length < 3) return { area: 0, perimeter: 0 };
  const lat0 = toRadians(points.reduce((sum, point) => sum + point.lat, 0) / points.length);
  const metersPerDegreeLat = 111132.92;
  const metersPerDegreeLon = 111412.84 * Math.cos(lat0);
  const xy = points.map((point) => ({ x: point.lon * metersPerDegreeLon, y: point.lat * metersPerDegreeLat }));
  let twiceArea = 0;
  let perimeter = 0;
  xy.forEach((point, index) => {
    const next = xy[(index + 1) % xy.length];
    twiceArea += point.x * next.y - next.x * point.y;
    perimeter += Math.hypot(next.x - point.x, next.y - point.y);
  });
  return { area: Math.abs(twiceArea) / 2, perimeter };
}

function orientation(ax: number, ay: number, bx: number, by: number, cx: number, cy: number) {
  const value = (by - ay) * (cx - bx) - (bx - ax) * (cy - by);
  if (Math.abs(value) < 1e-12) return 0;
  return value > 0 ? 1 : 2;
}

/**
 * True when the closed boundary crosses itself (e.g. a figure-eight walk). The shoelace area of a
 * self-crossing polygon is not the area the user walked around, so the UI warns instead of
 * presenting the number as reliable. Includes the closing edge (last point back to the first).
 */
export function hasSelfIntersection(points: Array<{ lat: number; lon: number }>): boolean {
  const n = points.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % n];
    for (let j = i + 1; j < n; j += 1) {
      // Skip edges that share a vertex with edge i.
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      const c = points[j];
      const d = points[(j + 1) % n];
      const o1 = orientation(a.lon, a.lat, b.lon, b.lat, c.lon, c.lat);
      const o2 = orientation(a.lon, a.lat, b.lon, b.lat, d.lon, d.lat);
      const o3 = orientation(c.lon, c.lat, d.lon, d.lat, a.lon, a.lat);
      const o4 = orientation(c.lon, c.lat, d.lon, d.lat, b.lon, b.lat);
      if (o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0 && o1 !== o2 && o3 !== o4) return true;
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
