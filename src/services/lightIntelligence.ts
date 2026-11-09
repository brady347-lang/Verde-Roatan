import { botanicalKnowledgeService } from './botanicalKnowledgeService';
import type { BotanicalProfile } from '../types/botanicalKnowledge';

export type LightBand = 'deep_shade' | 'low_light' | 'bright_indirect' | 'partial_sun' | 'full_sun';

export interface LightAssessment {
  lux: number;
  band: LightBand;
  label: string;
  guidance: string;
  confidence: 'low' | 'moderate';
}

export interface LightPlantMatch {
  profile: BotanicalProfile;
  fit: 'strong' | 'possible' | 'poor';
  reason: string;
}

/**
 * Converts a point-in-time illuminance reading into cautious horticultural guidance.
 * Lux is not PPFD/DLI and a single reading cannot establish daily light integral,
 * direct-sun duration, spectrum, or seasonal exposure.
 */
export function assessLight(lux: number): LightAssessment {
  const safeLux = Number.isFinite(lux) ? Math.max(0, lux) : 0;
  if (safeLux < 100) return { lux: safeLux, band: 'deep_shade', label: 'Very low light', guidance: 'Suitable only for very shade-tolerant plants; verify that the location still receives useful daylight.', confidence: 'low' };
  if (safeLux < 1000) return { lux: safeLux, band: 'low_light', label: 'Low light', guidance: 'Look for shade-tolerant foliage plants. Flowering and fruiting plants may struggle.', confidence: 'low' };
  if (safeLux < 10000) return { lux: safeLux, band: 'bright_indirect', label: 'Bright indirect light', guidance: 'A promising range for many indoor tropical foliage plants; check for direct sun and daily duration.', confidence: 'moderate' };
  if (safeLux < 25000) return { lux: safeLux, band: 'partial_sun', label: 'Strong / partial sun', guidance: 'Consider plants suited to filtered sun or partial sun. Observe the area at different times of day.', confidence: 'moderate' };
  return { lux: safeLux, band: 'full_sun', label: 'Very bright light', guidance: 'Potentially suitable for sun-loving plants, provided this exposure lasts long enough and heat/water needs are managed.', confidence: 'moderate' };
}

function fitForRequirement(requirement: BotanicalProfile['horticulture']['sunlight_requirements'], band: LightBand): LightPlantMatch['fit'] {
  const order: Record<LightBand, number> = { deep_shade: 0, low_light: 1, bright_indirect: 2, partial_sun: 3, full_sun: 4 };
  const requirementBand: Record<BotanicalProfile['horticulture']['sunlight_requirements'], number> = {
    deep_shade: 0, filtered_sun: 2, partial_shade: 3, full_sun: 4
  };
  const difference = Math.abs(order[band] - requirementBand[requirement]);
  return difference === 0 ? 'strong' : difference === 1 ? 'possible' : 'poor';
}

export function recommendPlantsForLight(lux: number, limit = 6): LightPlantMatch[] {
  const assessment = assessLight(lux);
  return botanicalKnowledgeService.getProfiles()
    .filter(profile => profile.visibility === 'public')
    .map(profile => {
      const fit = fitForRequirement(profile.horticulture.sunlight_requirements, assessment.band);
      const requirement = profile.horticulture.sunlight_requirements.replaceAll('_', ' ');
      return { profile, fit, reason: `Knowledge Center sunlight requirement: ${requirement}.` };
    })
    .filter(match => match.fit !== 'poor')
    .sort((a, b) => (a.fit === 'strong' ? 0 : 1) - (b.fit === 'strong' ? 0 : 1) || Number(b.profile.is_verified) - Number(a.profile.is_verified))
    .slice(0, Math.max(1, limit));
}
