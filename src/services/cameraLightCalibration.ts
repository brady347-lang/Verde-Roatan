export type CalibrationStage = 'dark' | 'shade' | 'indirect' | 'bright';

export interface CameraCalibrationSample {
  stage: CalibrationStage;
  response: number;
  referenceLux?: number;
  capturedAt: string;
}

export interface CameraCalibrationProfile {
  version: 1;
  deviceKey: string;
  samples: CameraCalibrationSample[];
  calibratedAt: string;
  quality: 'relative_only' | 'reference_calibrated';
}

const STORAGE_PREFIX = 'rootwise.camera-light-calibration.v1:';
const STAGE_ORDER: CalibrationStage[] = ['dark', 'shade', 'indirect', 'bright'];

export function normalizeCameraResponse(red: number, green: number, blue: number): number {
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  // The Rec. 709 weights do not sum to exactly 1.0 in floating point, so pure white would otherwise
  // normalise to 0.9999999999999999. Round away that noise (far below 8-bit camera precision).
  const normalized = Math.round((luminance / 255) * 1e9) / 1e9;
  return Math.max(0, Math.min(1, normalized));
}

export function summarizeFrame(data: Uint8ClampedArray): number {
  if (data.length < 4) throw new Error('Camera frame is empty.');
  const values: number[] = [];
  const pixelCount = Math.floor(data.length / 4);
  const stride = Math.max(1, Math.floor(pixelCount / 500));
  for (let pixel = 0; pixel < pixelCount; pixel += stride) {
    const offset = pixel * 4;
    values.push(normalizeCameraResponse(data[offset], data[offset + 1], data[offset + 2]));
  }
  values.sort((a, b) => a - b);
  const trim = Math.floor(values.length * 0.1);
  const useful = values.slice(trim, Math.max(trim + 1, values.length - trim));
  return useful.reduce((sum, value) => sum + value, 0) / useful.length;
}

export function buildCalibrationProfile(deviceKey: string, samples: CameraCalibrationSample[]): CameraCalibrationProfile {
  const ordered = [...samples].sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage));
  if (ordered.length !== 4 || STAGE_ORDER.some(stage => !ordered.some(sample => sample.stage === stage))) {
    throw new Error('All four lighting stages are required.');
  }
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i].response <= ordered[i - 1].response) {
      throw new Error('Lighting stages must produce increasing camera response. Repeat the measurements in steadier light.');
    }
  }
  const referenceSamples = ordered.filter(sample => Number.isFinite(sample.referenceLux) && (sample.referenceLux || 0) > 0);
  const referenceCalibrated = referenceSamples.length >= 3;
  if (referenceCalibrated) {
    for (let i = 1; i < referenceSamples.length; i++) {
      if ((referenceSamples[i].referenceLux || 0) <= (referenceSamples[i - 1].referenceLux || 0)) {
        throw new Error('Reference lux readings must increase with brightness.');
      }
    }
  }
  return {
    version: 1,
    deviceKey,
    samples: ordered,
    calibratedAt: new Date().toISOString(),
    quality: referenceCalibrated ? 'reference_calibrated' : 'relative_only'
  };
}

export function estimateLuxFromCamera(response: number, profile: CameraCalibrationProfile): { lux: number; confidence: 'low' | 'moderate' } | null {
  const points = profile.samples.filter(sample => Number.isFinite(sample.referenceLux) && (sample.referenceLux || 0) > 0);
  if (profile.quality !== 'reference_calibrated' || points.length < 3) return null;
  const value = Math.max(0, Math.min(1, response));
  let left = points[0], right = points[1];
  if (value >= points[points.length - 1].response) {
    left = points[points.length - 2]; right = points[points.length - 1];
  } else {
    for (let i = 0; i < points.length - 1; i++) {
      if (value >= points[i].response && value <= points[i + 1].response) {
        left = points[i]; right = points[i + 1]; break;
      }
    }
  }
  const span = right.response - left.response;
  if (span <= 0) return null;
  const ratio = (value - left.response) / span;
  const lux = (left.referenceLux || 0) + ratio * ((right.referenceLux || 0) - (left.referenceLux || 0));
  const outside = value < points[0].response || value > points[points.length - 1].response;
  return { lux: Math.max(0, lux), confidence: outside ? 'low' : 'moderate' };
}

export function saveCalibration(profile: CameraCalibrationProfile): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_PREFIX + encodeURIComponent(profile.deviceKey), JSON.stringify(profile));
}

export function loadCalibration(deviceKey: string): CameraCalibrationProfile | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + encodeURIComponent(deviceKey));
    if (!raw) return null;
    const profile = JSON.parse(raw) as CameraCalibrationProfile;
    return profile.version === 1 && profile.deviceKey === deviceKey ? profile : null;
  } catch {
    return null;
  }
}

export function getCameraDeviceKey(userAgent: string): string {
  return userAgent.slice(0, 180) || 'unknown-device';
}
