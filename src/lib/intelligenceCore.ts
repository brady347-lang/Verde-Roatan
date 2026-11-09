/**
 * RootWise Plant Intelligence Core: shared contract.
 *
 * Every intelligence service (identification, health, light, care, recommendations)
 * returns an IntelligenceResult so that origin, reliability and confidence are always
 * explicit, and so one resolver can stop services from contradicting each other.
 * Pure and dependency-free: usable from the app, workers and tests.
 */

export type Provenance =
  | 'verified_fact'            // admin-verified with written basis and a source
  | 'source_supported'         // backed by a cited source, not yet verified
  | 'sensor_measured'          // real device sensor reading
  | 'rule_derived'             // deterministic rule applied to other results
  | 'model_prediction'         // ML / AI output
  | 'camera_estimated'         // estimate from camera frames
  | 'user_observation'         // what the user reported seeing
  | 'user_feedback_unverified'; // corrections / ratings: recorded, never truth by themselves

/** Higher = more trustworthy. Conflict resolution prefers the higher rank. */
export const PROVENANCE_RANK: Record<Provenance, number> = {
  verified_fact: 100,
  source_supported: 80,
  sensor_measured: 75,
  rule_derived: 60,
  user_observation: 45,
  camera_estimated: 40,
  model_prediction: 35,
  user_feedback_unverified: 10
};

/** Maximum confidence a provenance may claim; stops predictions posing as facts. */
export const CONFIDENCE_CEILING: Record<Provenance, number> = {
  verified_fact: 1,
  source_supported: 0.9,
  sensor_measured: 0.85,
  rule_derived: 0.8,
  user_observation: 0.7,
  camera_estimated: 0.5,
  model_prediction: 0.85,
  user_feedback_unverified: 0.4
};

export type IntelligenceDomain = 'identification' | 'health' | 'light' | 'environment' | 'care' | 'recommendation';

export interface IntelligenceSource { provider: string; model?: string; version?: string; }

export interface IntelligenceResult<T = unknown> {
  domain: IntelligenceDomain;
  subject: string;               // plant key, garden id, etc. Never personal data.
  value: T;
  confidence: number;            // 0..1, clamped to the provenance ceiling
  confidenceLabel: 'low' | 'moderate' | 'high';
  provenance: Provenance;
  source: IntelligenceSource;
  evidenceRefs: string[];        // ids of knowledge entries, documents, measurements
  caveats: string[];
  createdAt: string;
}

export function confidenceLabel(confidence: number): IntelligenceResult['confidenceLabel'] {
  return confidence >= 0.75 ? 'high' : confidence >= 0.45 ? 'moderate' : 'low';
}

export function clampConfidence(value: number, provenance: Provenance): number {
  const finite = Number.isFinite(value) ? value : 0;
  return Math.min(Math.max(0, finite), CONFIDENCE_CEILING[provenance]);
}

export function makeResult<T>(input: {
  domain: IntelligenceDomain; subject: string; value: T; confidence: number; provenance: Provenance;
  source: IntelligenceSource; evidenceRefs?: string[]; caveats?: string[]; now?: Date;
}): IntelligenceResult<T> {
  const evidenceRefs = input.evidenceRefs ?? [];
  // A "verified" or "source supported" claim without evidence is not allowed: downgrade honestly.
  let provenance = input.provenance;
  const caveats = [...(input.caveats ?? [])];
  if ((provenance === 'verified_fact' || provenance === 'source_supported') && evidenceRefs.length === 0) {
    provenance = 'model_prediction';
    caveats.push('Downgraded: no evidence reference was supplied.');
  }
  const confidence = clampConfidence(input.confidence, provenance);
  return {
    domain: input.domain, subject: input.subject, value: input.value, confidence,
    confidenceLabel: confidenceLabel(confidence), provenance, source: input.source,
    evidenceRefs, caveats, createdAt: (input.now ?? new Date()).toISOString()
  };
}

/** Plain-language label so the UI never shows a prediction as fact. */
export function provenanceLabel(provenance: Provenance, lang: 'en' | 'es' = 'en'): string {
  const en: Record<Provenance, string> = {
    verified_fact: 'Verified', source_supported: 'Supported by a source', sensor_measured: 'Measured by device sensor',
    rule_derived: 'Calculated from rules', model_prediction: 'AI suggestion (not confirmed)', camera_estimated: 'Estimated from camera',
    user_observation: 'Your observation', user_feedback_unverified: 'Unverified feedback'
  };
  const es: Record<Provenance, string> = {
    verified_fact: 'Verificado', source_supported: 'Respaldado por una fuente', sensor_measured: 'Medido con el sensor del dispositivo',
    rule_derived: 'Calculado con reglas', model_prediction: 'Sugerencia de IA (no confirmada)', camera_estimated: 'Estimado con la cámara',
    user_observation: 'Tu observación', user_feedback_unverified: 'Comentario sin verificar'
  };
  return (lang === 'es' ? es : en)[provenance];
}

/** Pick the best value for one fact (e.g. a plant's light requirement) from several candidates. */
export interface Candidate<T> { value: T; provenance: Provenance; confidence: number; evidenceRefs?: string[]; }
export function resolveFact<T>(candidates: Candidate<T>[]): { chosen: Candidate<T> | null; disagreement: boolean } {
  const usable = candidates.filter(c => c.value !== undefined && c.value !== null);
  if (!usable.length) return { chosen: null, disagreement: false };
  const sorted = [...usable].sort((a, b) =>
    PROVENANCE_RANK[b.provenance] - PROVENANCE_RANK[a.provenance] ||
    clampConfidence(b.confidence, b.provenance) - clampConfidence(a.confidence, a.provenance));
  const disagreement = usable.some(c => JSON.stringify(c.value) !== JSON.stringify(sorted[0].value));
  return { chosen: sorted[0], disagreement };
}

/** Recommendation conflict handling. */
export type RecommendationAction = 'increase' | 'decrease' | 'maintain';
export interface Recommendation {
  id: string; topic: string;      // e.g. 'light', 'water', 'fertilizer'
  action: RecommendationAction; text: string;
  provenance: Provenance; confidence: number;
}
export interface ResolvedRecommendations {
  accepted: Recommendation[];
  suppressed: Array<{ recommendation: Recommendation; reason: string }>;
  needsReview: Array<{ topic: string; options: Recommendation[] }>;
}

const TIE_MARGIN = 0.1;

export function resolveRecommendations(input: Recommendation[]): ResolvedRecommendations {
  const accepted: Recommendation[] = [];
  const suppressed: ResolvedRecommendations['suppressed'] = [];
  const needsReview: ResolvedRecommendations['needsReview'] = [];
  const byTopic = new Map<string, Recommendation[]>();
  for (const rec of input) byTopic.set(rec.topic, [...(byTopic.get(rec.topic) ?? []), rec]);
  for (const [topic, recs] of byTopic) {
    const actions = new Set(recs.map(r => r.action));
    if (actions.size === 1) { accepted.push(...recs); continue; }
    const score = (r: Recommendation) => PROVENANCE_RANK[r.provenance] + clampConfidence(r.confidence, r.provenance) * 10;
    const ranked = [...recs].sort((a, b) => score(b) - score(a));
    const top = ranked[0];
    const rival = ranked.find(r => r.action !== top.action)!;
    const sameTier = PROVENANCE_RANK[top.provenance] === PROVENANCE_RANK[rival.provenance];
    const closeConfidence = Math.abs(clampConfidence(top.confidence, top.provenance) - clampConfidence(rival.confidence, rival.provenance)) < TIE_MARGIN;
    if (sameTier && closeConfidence) {
      needsReview.push({ topic, options: ranked });
      ranked.forEach(r => suppressed.push({ recommendation: r, reason: 'Services disagree with similar reliability; shown as a question, not advice.' }));
      continue;
    }
    accepted.push(top);
    ranked.filter(r => r.action !== top.action).forEach(r => suppressed.push({ recommendation: r, reason: `Contradicted by a more reliable ${top.provenance} result.` }));
    ranked.filter(r => r !== top && r.action === top.action).forEach(r => accepted.push(r));
  }
  return { accepted, suppressed, needsReview };
}

/** Botanical Memory gate: only approved, anonymized, consented, non-private signals may enter shared learning. */
export interface LearningSignal {
  kind: 'identification_confirmation' | 'correction' | 'recommendation_feedback' | 'light_calibration';
  consentedToShare: boolean;
  anonymized: boolean;
  approvedByReviewer: boolean;
  payload: Record<string, unknown>;
}
const PRIVATE_KEYS = ['user_id', 'email', 'photo', 'image', 'image_url', 'image_storage_path', 'garden', 'gardenid', 'location', 'lat', 'lon', 'latitude', 'longitude', 'phone', 'name'];

function findPrivateKey(value: unknown, depth = 0): string | null {
  if (depth > 6 || value === null || typeof value !== 'object') return null;
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    if (PRIVATE_KEYS.includes(key.toLowerCase())) return key;
    const nested = findPrivateKey(inner, depth + 1);
    if (nested) return nested;
  }
  return null;
}

export function canEnterBotanicalMemory(signal: LearningSignal): { allowed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!signal.consentedToShare) reasons.push('No sharing consent.');
  if (!signal.anonymized) reasons.push('Not anonymized.');
  if (!signal.approvedByReviewer) reasons.push('Not approved by a reviewer.');
  const privateKey = findPrivateKey(signal.payload);
  if (privateKey) reasons.push(`Payload contains private field "${privateKey}".`);
  return { allowed: reasons.length === 0, reasons };
}

/** Feedback is recorded and queued for investigation; it never becomes verified knowledge by itself. */
export function feedbackToEvidence(feedback: { subject: string; claim: string; kind: 'identification_correction' | 'recommendation_inaccurate' }) {
  return {
    evidence_type: feedback.kind === 'identification_correction' ? 'community_correction' : 'field_observation',
    subject_key: feedback.subject,
    verification_status: 'community_submitted' as const,
    provenance: 'user_feedback_unverified' as Provenance,
    submitted_payload: { claim: feedback.claim }
  };
}
