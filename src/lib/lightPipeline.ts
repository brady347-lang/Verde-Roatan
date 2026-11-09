import { makeResult, type Candidate, type IntelligenceResult, type Provenance, resolveFact } from './intelligenceCore.ts';

/**
 * Light pipeline: turns a measured or estimated illuminance into plant-specific guidance
 * that is explicit about how the number was obtained. A single lux value is not PPFD/DLI
 * and a camera estimate is never equivalent to a lux meter.
 */
export type LightBand = 'deep_shade' | 'low_light' | 'bright_indirect' | 'partial_sun' | 'full_sun';
export type LightRequirement = 'deep_shade' | 'filtered_sun' | 'partial_shade' | 'full_sun';
export type LightMethod = 'sensor_measured' | 'camera_estimated';

export interface LightReading { lux: number; method: LightMethod; deviceKey?: string; }

export const LIGHT_BAND_LIMITS: Array<{ below: number; band: LightBand }> = [
  { below: 100, band: 'deep_shade' }, { below: 1000, band: 'low_light' },
  { below: 10000, band: 'bright_indirect' }, { below: 25000, band: 'partial_sun' }
];
export function bandForLux(lux: number): LightBand {
  const safe = Number.isFinite(lux) ? Math.max(0, lux) : 0;
  return LIGHT_BAND_LIMITS.find(limit => safe < limit.below)?.band ?? 'full_sun';
}

const BAND_ORDER: Record<LightBand, number> = { deep_shade: 0, low_light: 1, bright_indirect: 2, partial_sun: 3, full_sun: 4 };
const REQUIREMENT_ORDER: Record<LightRequirement, number> = { deep_shade: 0, filtered_sun: 2, partial_shade: 3, full_sun: 4 };

export type LightFit = 'matches' | 'close' | 'mismatch';
export interface LightInterpretation {
  lux: number; band: LightBand; method: LightMethod; measured: boolean;
  requirement: LightRequirement | null; fit: LightFit | null;
  direction: 'increase_light' | 'reduce_light' | 'keep' | null;
  summary: string;
}

/** Pick the most reliable light requirement from candidate sources (knowledge base first). */
export function resolveLightRequirement(candidates: Array<Candidate<LightRequirement>>) {
  return resolveFact(candidates);
}

export interface ProfileLike { id: string; is_verified?: boolean; horticulture?: { sunlight_requirements?: LightRequirement } }
/** Convert a Knowledge Center profile into a candidate; unverified profiles are never treated as fact. */
export function requirementCandidate(profile: ProfileLike | null | undefined): Candidate<LightRequirement> | null {
  const value = profile?.horticulture?.sunlight_requirements;
  if (!profile || !value) return null;
  return profile.is_verified
    ? { value, provenance: 'source_supported', confidence: 0.85, evidenceRefs: [profile.id] }
    : { value, provenance: 'model_prediction', confidence: 0.5, evidenceRefs: [profile.id] };
}

export function interpretLight(
  reading: LightReading,
  requirement: { value: LightRequirement; provenance: Provenance; evidenceRefs?: string[] } | null,
  now?: Date
): IntelligenceResult<LightInterpretation> {
  const valid = Number.isFinite(reading.lux) && reading.lux >= 0;
  const lux = valid ? reading.lux : 0;
  const band = bandForLux(lux);
  const measured = reading.method === 'sensor_measured';
  const caveats = [
    'A single reading does not show daily light, sun duration or season.',
    measured ? 'Phone light sensors differ by device; treat as approximate.' : 'Estimated from the camera. This is not equivalent to a lux-meter measurement.'
  ];
  if (!valid) caveats.push('Invalid reading ignored.');
  let fit: LightFit | null = null;
  let direction: LightInterpretation['direction'] = null;
  if (requirement) {
    const diff = BAND_ORDER[band] - REQUIREMENT_ORDER[requirement.value];
    fit = Math.abs(diff) === 0 ? 'matches' : Math.abs(diff) === 1 ? 'close' : 'mismatch';
    direction = fit === 'matches' ? 'keep' : diff < 0 ? 'increase_light' : 'reduce_light';
    if (requirement.provenance !== 'verified_fact' && requirement.provenance !== 'source_supported') caveats.push('The plant\'s light requirement is not yet verified.');
  } else caveats.push('Plant not identified: showing the light level only.');
  const how = measured ? 'Measured' : 'Estimated';
  const summary = `${how} ${Math.round(lux).toLocaleString('en-US')} lux (${band.replace('_', ' ')})` +
    (requirement ? `; plant needs ${requirement.value.replace('_', ' ')} → ${fit}.` : '.');
  const provenance: Provenance = measured ? 'sensor_measured' : 'camera_estimated';
  // Requirement reliability limits the recommendation as well as the reading.
  const reqConfidence = requirement ? (requirement.provenance === 'verified_fact' || requirement.provenance === 'source_supported' ? 0.8 : 0.5) : 0.6;
  return makeResult<LightInterpretation>({
    domain: 'light', subject: requirement ? requirement.value : 'site', provenance,
    confidence: valid ? Math.min(measured ? 0.7 : 0.4, reqConfidence) : 0,
    value: { lux, band, method: reading.method, measured, requirement: requirement?.value ?? null, fit, direction, summary },
    source: { provider: 'rootwise-light-pipeline', version: '1' },
    evidenceRefs: requirement?.evidenceRefs ?? [], caveats, now
  });
}

/** Compare camera estimates with verified professional lux-meter readings. */
export interface ReferencePair { estimatedLux: number; referenceLux: number; }
export interface CalibrationEvaluation {
  pairs: number; medianAbsPctError: number | null; bias: number | null; withinFactorTwo: number | null;
  trustworthy: boolean; note: string;
}
export function evaluateCameraEstimates(pairs: ReferencePair[]): CalibrationEvaluation {
  const usable = pairs.filter(p => Number.isFinite(p.estimatedLux) && Number.isFinite(p.referenceLux) && p.referenceLux > 0 && p.estimatedLux >= 0);
  if (usable.length < 5) return { pairs: usable.length, medianAbsPctError: null, bias: null, withinFactorTwo: null, trustworthy: false, note: 'At least 5 professional reference readings are needed before estimates can be trusted.' };
  const errors = usable.map(p => Math.abs(p.estimatedLux - p.referenceLux) / p.referenceLux).sort((a, b) => a - b);
  const mid = Math.floor(errors.length / 2);
  const median = errors.length % 2 ? errors[mid] : (errors[mid - 1] + errors[mid]) / 2;
  const bias = usable.reduce((s, p) => s + (p.estimatedLux - p.referenceLux) / p.referenceLux, 0) / usable.length;
  const within = usable.filter(p => p.estimatedLux <= p.referenceLux * 2 && p.estimatedLux >= p.referenceLux / 2).length / usable.length;
  const trustworthy = median <= 0.35 && within >= 0.9;
  return { pairs: usable.length, medianAbsPctError: median, bias, withinFactorTwo: within, trustworthy,
    note: trustworthy ? 'Estimates agree with reference readings on this evidence; they remain estimates.' : 'Estimates do not yet agree closely enough with reference readings.' };
}
