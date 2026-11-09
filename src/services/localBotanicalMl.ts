import { Capacitor } from '@capacitor/core';
import { RootWiseBotanicalML } from '@rootwise/botanical-ml';
import type { AIAnalysisResult } from '../types';

/**
 * Attempts a fully on-device plant identification.
 *
 * Returns null when running on web, when the native plugin is unavailable, or when
 * the trained model/reference catalog have not been installed. It never manufactures
 * a result from heuristic image features.
 */
export async function tryLocalBotanicalIdentification(image: string): Promise<AIAnalysisResult | null> {
  if (!Capacitor.isNativePlatform()) return null;

  const readiness = await RootWiseBotanicalML.getReadiness();
  if (!readiness.ready) return null;

  const local = await RootWiseBotanicalML.identify({
    image,
    topK: 3,
    confidenceThreshold: 0.65
  });

  if (local.status !== 'success' || !Array.isArray(local.candidates)) return null;

  return {
    status: 'success',
    matched: local.matched,
    model_used: `RootWise LiteRT ${local.model_version} (on-device)`,
    candidates: local.candidates.map((candidate) => ({
      common_name: candidate.common_name,
      scientific_name: candidate.scientific_name,
      confidence_score: candidate.confidence_score
    })),
    ml_visual_evidence: {
      status: 'success',
      decision: local.matched ? 'accept' : 'review',
      model_version: local.model_version,
      top_predictions: local.candidates.map((candidate) => ({ label: candidate.scientific_name }))
    },
    notice: local.notice
  };
}
