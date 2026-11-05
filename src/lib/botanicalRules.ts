// Deterministic botanical intelligence. No network and no AI: every recommendation is computed from
// the structured plant data (sun, water, salt tolerance, pet safety, tags, native status) and every score
// can be traced to a written rule. This keeps search and care advice working when AI services are down.

import type { CatalogItem, GardenAdvisorResult, GardenRecommendationItem, Language } from '../types';

export const normalizeText = (v: string): string =>
  String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9/ ]+/g, ' ').replace(/\s+/g, ' ').trim();

// ------------------------------------------------------------------------------------------------
// Search (accent-insensitive, every word must match, bilingual aliases, tolerant of small typos)
// ------------------------------------------------------------------------------------------------
const ALIASES: Record<string, string[]> = {
  palma: ['palm'], palmas: ['palm'], flor: ['flower'], flores: ['flower'], sombra: ['shade'], sol: ['sun'],
  arbusto: ['shrub'], arbustos: ['shrub'], cesped: ['grass', 'lawn'], zacate: ['grass'], pasto: ['grass'],
  fertilizante: ['fertilizer'], abono: ['fertilizer', 'compost'], plaga: ['pest'], plagas: ['pest'],
  mascota: ['pet'], mascotas: ['pet'], nativa: ['native'], nativo: ['native'], coco: ['coconut', 'cocos'],
  trepadora: ['vine'], sal: ['salt'], seto: ['hedge'], privacidad: ['privacy'], tierra: ['soil'], suelo: ['soil']
};

export function levenshtein(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = i;
    let rowMin = last;
    for (let j = 1; j <= b.length; j++) {
      const cur = Math.min(prev[j] + 1, last + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev[j - 1] = last;
      last = cur;
      if (cur < rowMin) rowMin = cur;
    }
    prev[b.length] = last;
    if (rowMin > max) return max + 1;
  }
  return prev[b.length];
}

function haystack(item: CatalogItem): { text: string; words: string[] } {
  const text = normalizeText([item.name, item.sci, item.note, item.category, item.kind, item.sun, ...(item.tags || [])].join(' '));
  return { text, words: [...new Set(text.split(' ').filter((w) => w.length >= 3))] };
}

/** True when every word of the query matches the item (substring, alias, or a one/two-letter typo). */
export function matchesQuery(item: CatalogItem, query: string): boolean {
  const tokens = normalizeText(query).split(' ').filter(Boolean);
  if (tokens.length === 0) return true;
  const { text, words } = haystack(item);
  return tokens.every((tok) => {
    const options = [tok, ...(ALIASES[tok] || [])];
    return options.some((o) => {
      if (text.includes(o)) return true;
      if (o.length < 5) return false;
      const tolerance = o.length >= 8 ? 2 : 1;
      return words.some((w) => Math.abs(w.length - o.length) <= tolerance && levenshtein(o, w, tolerance) <= tolerance);
    });
  });
}

// ------------------------------------------------------------------------------------------------
// Plant traits from catalog text
// ------------------------------------------------------------------------------------------------
type Sun = 'full' | 'partial' | 'shade';
type Water = 'low' | 'moderate' | 'high';

export function sunLevels(text: string): Set<Sun> {
  const t = normalizeText(text);
  const out = new Set<Sun>();
  if (/full|direct|all day|pleno|directo|tropical sun/.test(t)) out.add('full');
  if (/partial|filtered|bright|dappled|parcial|filtrad|medium|morning/.test(t)) out.add('partial');
  if (/shade|low light|sombra|indirect|indoor/.test(t) && !/partial shade|sombra parcial/.test(t.replace(/shade to|to shade/g, 'shade'))) out.add('shade');
  if (/partial shade|sombra parcial/.test(t)) out.add('partial');
  return out;
}

export function waterLevel(text: string): Water {
  const t = normalizeText(text);
  const every = t.match(/every (\d+)(?: ?- ?(\d+))? days?/);
  if (every) {
    const n = Number(every[2] || every[1]);
    if (/drought|low/.test(t)) return 'low';
    return n <= 2 ? 'high' : n === 3 ? 'moderate' : 'low';
  }
  if (/low|drought|sparing|poco|minimal|once established/.test(t)) return 'low';
  if (/daily|moist|frequent|diario|humedo|keep wet|constant/.test(t)) return 'high';
  return 'moderate';
}

// ------------------------------------------------------------------------------------------------
// Understanding the gardener's conditions
// ------------------------------------------------------------------------------------------------
export type Goal = 'privacy' | 'flowers' | 'wind' | 'edible' | 'low_maintenance' | 'lush' | 'native' | 'indoor';
export interface Needs {
  sun?: Sun;
  /** 0 sheltered, 1 breezy, 2 oceanfront / salt spray */
  salt?: 0 | 1 | 2;
  soil?: 'sand' | 'clay' | 'loam' | 'container';
  irrigation?: 'frequent' | 'weekend' | 'rain';
  goals: Set<Goal>;
  petSafe: boolean;
  understood: string[];
}

const labeled = (text: string, label: string): string => {
  const m = normalizeText(text).match(new RegExp(`${label}\\s*:\\s*([^\\n]*?)(?=\\s+(?:sunlight|soil/substrate|microclimate/salt|watering|desired goals|special notes|location)\\s*:|$)`));
  return m ? m[1].trim() : '';
};

export function parseNeeds(conditions: string, goals: string, lang: Language = 'en'): Needs {
  const es = lang === 'es';
  const all = normalizeText(`${conditions}\n${goals}`);
  const sunT = labeled(conditions, 'sunlight') || all;
  const soilT = labeled(conditions, 'soil/substrate') || all;
  const expT = labeled(conditions, 'microclimate/salt') || all;
  const watT = labeled(conditions, 'watering') || all;
  const needs: Needs = { goals: new Set(), petSafe: false, understood: [] };
  const say = (en: string, esText: string) => needs.understood.push(es ? esText : en);

  if (/deep shade|full shade|sombra profunda|forest|canopy/.test(sunT)) { needs.sun = 'shade'; say('deep shade', 'sombra profunda'); }
  else if (/partial|filtered|dappled|parcial|filtrad|morning/.test(sunT)) { needs.sun = 'partial'; say('partial shade', 'sombra parcial'); }
  else if (/indoor|covered porch|galeria|interior\b(?! sheltered)/.test(sunT) && !/sheltered interior/.test(sunT)) { needs.sun = 'partial'; needs.goals.add('indoor'); say('covered / bright indirect light', 'luz indirecta (galería)'); }
  else if (/full sun|sol pleno|direct|directo|full_sun/.test(sunT)) { needs.sun = 'full'; say('full sun', 'sol pleno'); }

  if (/oceanfront|beachfront|frente al mar|salt spray|coastal|playa|costera/.test(expT)) { needs.salt = 2; say('oceanfront salt exposure', 'exposición salina frente al mar'); }
  else if (/hillside|breeze|brisa|colina/.test(expT)) { needs.salt = 1; say('hillside breeze', 'brisa de colina'); }
  else if (/sheltered|protegid|interior/.test(expT)) { needs.salt = 0; say('sheltered site', 'sitio protegido'); }

  if (/beach sand|coastal sand|arena|sandy/.test(soilT)) { needs.soil = 'sand'; say('sandy soil', 'suelo arenoso'); }
  else if (/clay|arcilla/.test(soilT)) { needs.soil = 'clay'; say('clay soil', 'suelo arcilloso'); }
  else if (/loam|franco|tierra negra/.test(soilT)) { needs.soil = 'loam'; say('loam soil', 'suelo franco'); }
  else if (/container|pots|planter|maceta|jardinera/.test(soilT)) { needs.soil = 'container'; say('containers', 'macetas'); }

  if (/rain only|solo lluvia|rain_only/.test(watT)) { needs.irrigation = 'rain'; say('rainfall only', 'solo lluvia'); }
  else if (/weekend|fin de semana/.test(watT)) { needs.irrigation = 'weekend'; say('weekend-only watering', 'riego solo en fin de semana'); }
  else if (/daily|drip|diario|goteo|automated/.test(watT)) { needs.irrigation = 'frequent'; }

  const g = (re: RegExp, goal: Goal, en: string, esT: string) => { if (re.test(all)) { needs.goals.add(goal); say(en, esT); } };
  g(/privacy|screen|hedge|privacidad|muro verde|seto/, 'privacy', 'privacy screen', 'privacidad');
  g(/bloom|flower|colorful|flor|color/, 'flowers', 'flowers', 'flores');
  g(/wind|hurricane|storm|viento|huracan/, 'wind', 'wind resilience', 'resistencia al viento');
  g(/edible|fruit|herb|fruto|comestible/, 'edible', 'edible fruit', 'frutos comestibles');
  g(/drought|low maintenance|hardy|bajo mantenimiento|resistente/, 'low_maintenance', 'low maintenance', 'bajo mantenimiento');
  g(/lush|jungle|resort|follaje|selva/, 'lush', 'lush foliage', 'follaje exuberante');
  g(/native|nativ/, 'native', 'native plants', 'plantas nativas');
  needs.petSafe = /\bpets?\b|\bdogs?\b|\bcats?\b|mascota|perro|gato|child|kids|ninos/.test(normalizeText(goals));
  if (needs.petSafe) say('pet-safe plants', 'plantas seguras para mascotas');
  return needs;
}

// ------------------------------------------------------------------------------------------------
// Scoring
// ------------------------------------------------------------------------------------------------
interface Scored { item: CatalogItem; score: number; reasons: string[]; cautions: string[] }
const ADJACENT: Record<Sun, Sun[]> = { full: ['partial'], partial: ['full', 'shade'], shade: ['partial'] };

export function scorePlant(item: CatalogItem, needs: Needs, lang: Language = 'en'): Scored {
  const es = lang === 'es';
  const L = (en: string, esT: string) => (es ? esT : en);
  const reasons: string[] = [];
  const cautions: string[] = [];
  let score = 40;
  const tags = new Set((item.tags || []).map(normalizeText));
  const text = normalizeText(`${item.name} ${item.note} ${item.category} ${[...tags].join(' ')}`);
  const sun = sunLevels(item.sun || '');
  const water = waterLevel(item.water || '');
  const salt = item.salt ?? 1;

  if (needs.sun && sun.size) {
    if (sun.has(needs.sun)) { score += 20; reasons.push(L(`Its light range (${item.sun}) covers your ${needs.sun === 'full' ? 'full-sun' : needs.sun === 'shade' ? 'deep-shade' : 'partial-shade'} site.`, `Su rango de luz (${item.sun}) cubre su sitio.`)); }
    else if (ADJACENT[needs.sun].some((s) => sun.has(s))) { score += 5; cautions.push(L(`It prefers "${item.sun}", which is close to but not exactly your light.`, `Prefiere "${item.sun}", cercano pero no igual a su luz.`)); }
    else { score -= 30; cautions.push(L(`It needs "${item.sun}", which does not match your light.`, `Necesita "${item.sun}", que no coincide con su luz.`)); }
  }
  if (needs.salt === 2) {
    if (salt >= 3) { score += 22; reasons.push(L('Rated highly salt-tolerant for oceanfront spray.', 'Alta tolerancia a la sal para frente al mar.')); }
    else if (salt === 2) { score += 8; reasons.push(L('Moderate salt tolerance; place it slightly back from direct spray.', 'Tolerancia moderada a la sal; ubíquela algo retirada del rocío directo.')); }
    else { score -= 28; cautions.push(L('Low salt tolerance; it is a poor fit for oceanfront spray.', 'Baja tolerancia a la sal; no recomendada frente al mar.')); }
  } else if (needs.salt === 1 && salt >= 2) { score += 8; reasons.push(L('Handles breezy, mildly salty air.', 'Tolera brisa con algo de sal.')); }
  if (needs.soil === 'sand' && water === 'low') { score += 8; reasons.push(L('Low water needs suit fast-draining sand.', 'Poca necesidad de agua; apta para arena de drenaje rápido.')); }
  if (needs.soil === 'clay' && water !== 'low') { score += 6; reasons.push(L('Moisture-retentive clay supports its water needs.', 'La arcilla retiene la humedad que necesita.')); }
  if (needs.irrigation === 'rain') {
    if (water === 'low') { score += 14; reasons.push(L('Low water needs; can live on rainfall.', 'Poca agua; puede vivir de la lluvia.')); }
    else if (water === 'high') { score -= 20; cautions.push(L('High water needs; rainfall alone will not be enough in the dry season.', 'Mucha agua; la lluvia sola no basta en la temporada seca.')); }
  } else if (needs.irrigation === 'weekend') {
    if (water === 'low') { score += 6; reasons.push(L('Low water needs suit weekend-only watering.', 'Poca agua; apta para riego de fin de semana.')); }
    else if (water === 'high') { score -= 8; cautions.push(L('High water needs; weekend-only watering may not be enough.', 'Mucha agua; el riego de fin de semana puede no bastar.')); }
  }
  if (needs.petSafe) {
    if (item.pet === 'safe') { score += 10; reasons.push(L('Listed as pet-safe.', 'Registrada como segura para mascotas.')); }
    else { score -= 45; cautions.push(L('Not confirmed pet-safe: check toxicity before planting where pets roam.', 'No confirmada como segura para mascotas: verifique su toxicidad.')); }
  }
  const has = (...w: string[]) => w.some((x) => tags.has(x) || text.includes(x));
  if (needs.goals.has('privacy') && has('privacy', 'hedge', 'screen')) { score += 15; reasons.push(L('Works as a privacy screen or hedge.', 'Funciona como seto o pantalla de privacidad.')); }
  if (needs.goals.has('flowers') && (item.kind === 'flower' || has('flower', 'bloom', 'colorful'))) { score += 15; reasons.push(L('Provides flowers and colour.', 'Aporta flores y color.')); }
  if (needs.goals.has('wind') && (salt >= 3 || has('windbreak', 'hardy', 'salt hardy'))) { score += 12; reasons.push(L('Hardy in strong trade winds.', 'Resistente a vientos fuertes.')); }
  if (needs.goals.has('edible') && has('edible', 'fruit', 'herb')) { score += 18; reasons.push(L('Produces edible fruit or herbs.', 'Produce frutos o hierbas comestibles.')); }
  if (needs.goals.has('low_maintenance')) {
    if (water === 'low') { score += 12; reasons.push(L('Low-maintenance and drought-tolerant.', 'Bajo mantenimiento y resistente a la sequía.')); }
    else if (has('hardy')) score += 6;
  }
  if (needs.goals.has('lush') && has('tropical', 'foliage', 'lush')) { score += 10; reasons.push(L('Adds lush tropical foliage.', 'Aporta follaje tropical exuberante.')); }
  if (needs.goals.has('native') && item.native_to_bay_islands) { score += 15; reasons.push(L('Native to the Bay Islands.', 'Nativa de las Islas de la Bahía.')); }
  if (needs.goals.has('indoor') && has('indoor', 'patio', 'shade')) { score += 12; reasons.push(L('Suited to covered or indoor spots.', 'Apta para espacios cubiertos o interiores.')); }
  return { item, score, reasons, cautions };
}

export function careTip(item: CatalogItem, needs: Needs, lang: Language = 'en'): string {
  const es = lang === 'es';
  const parts: string[] = [];
  if (item.water) parts.push(es ? `Riego: ${item.water}.` : `Watering: ${item.water}.`);
  if (item.sun) parts.push(es ? `Luz: ${item.sun}.` : `Light: ${item.sun}.`);
  parts.push(es ? 'Riegue profundamente 2 o 3 veces por semana durante los primeros 2-3 meses y cubra la base con mantillo.' : 'Water deeply 2-3 times a week for the first 2-3 months and mulch the base.');
  if (needs.salt === 2 && (item.salt ?? 1) < 3) parts.push(es ? 'Plántela detrás de una barrera más tolerante a la sal.' : 'Plant it behind a more salt-tolerant barrier.');
  return parts.join(' ');
}

export interface RuleAdviceInput { conditions: string; goals: string; catalog: CatalogItem[]; lang: Language; limit?: number }

export function buildRuleBasedAdvice({ conditions, goals, catalog, lang, limit = 4 }: RuleAdviceInput): GardenAdvisorResult {
  const es = lang === 'es';
  const needs = parseNeeds(conditions, goals, lang);
  const scored = catalog
    .filter((c) => c.t === 'plant' && c.stock !== 'Out of stock')
    .map((c) => scorePlant(c, needs, lang))
    .sort((a, b) => b.score - a.score || (b.item.salt ?? 0) - (a.item.salt ?? 0) || a.item.name.localeCompare(b.item.name));
  const good = scored.filter((s) => s.score >= 55).slice(0, limit);
  const chosen = good.length ? good : scored.slice(0, Math.min(3, scored.length));
  const understood = needs.understood.length ? needs.understood.join(', ') : (es ? 'sin condiciones específicas' : 'no specific conditions');

  const summary = good.length
    ? (es ? `Se compararon las plantas en existencia con sus condiciones (${understood}). Estas son las mejores coincidencias según reglas botánicas; la IA no está en uso.`
          : `In-stock plants were compared with your conditions (${understood}). These are the best matches by botanical rules; AI is not being used.`)
    : (es ? `Ninguna planta en existencia cumple bien todas sus condiciones (${understood}). Se muestran las más cercanas con sus advertencias.`
          : `No in-stock plant fits all of your conditions (${understood}). The closest options are shown with their cautions.`);

  const assess: NonNullable<GardenAdvisorResult['conditions_assessment']> = {
    sun_and_microclimate: needs.sun
      ? (es ? `Luz indicada: ${needs.sun === 'full' ? 'sol pleno' : needs.sun === 'partial' ? 'sombra parcial' : 'sombra profunda'}.` : `Light entered: ${needs.sun === 'full' ? 'full sun' : needs.sun === 'partial' ? 'partial shade' : 'deep shade'}.`)
      : (es ? 'No se indicó la luz solar.' : 'Sunlight was not specified.'),
    soil_and_drainage: needs.soil === 'sand' ? (es ? 'Arena costera: drena muy rápido; mezcle composta o bonote para retener humedad.' : 'Coastal sand drains very fast; blend in compost or coir to hold moisture.')
      : needs.soil === 'clay' ? (es ? 'Arcilla: retiene agua; asegure drenaje para evitar pudrición de raíces.' : 'Clay holds water; make sure it drains to avoid root rot.')
      : needs.soil === 'container' ? (es ? 'Macetas: use sustrato con drenaje y revise el riego con frecuencia.' : 'Containers: use a free-draining mix and check watering often.')
      : needs.soil === 'loam' ? (es ? 'Suelo franco: buena base para la mayoría de las plantas.' : 'Loam is a good all-round base for most plants.')
      : (es ? 'No se indicó el tipo de suelo.' : 'Soil type was not specified.'),
    wind_and_salt_tolerance: needs.salt === 2 ? (es ? 'Frente al mar: priorice plantas con tolerancia alta a la sal.' : 'Oceanfront: prioritise plants with high salt tolerance.')
      : needs.salt === 1 ? (es ? 'Brisa de colina: tolerancia moderada a la sal es suficiente.' : 'Hillside breeze: moderate salt tolerance is enough.')
      : needs.salt === 0 ? (es ? 'Sitio protegido: la sal y el viento no son limitantes.' : 'Sheltered site: salt and wind are not limiting.')
      : (es ? 'No se indicó la exposición.' : 'Exposure was not specified.')
  };

  const tips: string[] = [];
  if (needs.soil === 'sand') tips.push(es ? 'En arena costera, mezcle composta o bonote de coco para retener humedad y nutrientes.' : 'In coastal sand, mix in compost or coconut coir to hold moisture and nutrients.');
  if (needs.soil === 'clay') tips.push(es ? 'En arcilla roja, plante sobre un pequeño montículo y agregue materia orgánica para mejorar el drenaje.' : 'In red clay, plant on a slight mound and add organic matter to improve drainage.');
  if (needs.salt === 2) tips.push(es ? 'Enjuague el follaje joven con agua dulce tras temporales con rocío salino.' : 'Rinse young foliage with fresh water after storms that carry salt spray.');
  tips.push(es ? 'Riegue temprano en la mañana para que el follaje se seque antes del anochecer y se reduzcan los hongos.' : 'Water early in the morning so foliage dries before dusk, which reduces fungal problems.');
  tips.push(es ? 'Plante al inicio de la temporada de lluvias para que las raíces se establezcan con menos riego.' : 'Plant at the start of the rainy season so roots establish with less irrigation.');

  const recommendations: GardenRecommendationItem[] = chosen.map((s) => ({
    product_id: s.item.id,
    product_name: s.item.name,
    match_score: Math.max(20, Math.min(98, Math.round(s.score))),
    why_it_fits: [...s.reasons, ...(s.cautions.length ? [(es ? 'Precauciones: ' : 'Cautions: ') + s.cautions.join(' ')] : [])].join(' ')
      || (es ? 'Coincidencia general con el catálogo; no se indicaron condiciones específicas.' : 'General catalog match; no specific conditions were given.'),
    care_and_placement_tip: careTip(s.item, needs, lang),
    catalog_item: s.item
  }));
  return { status: 'success', summary, conditions_assessment: assess, recommendations, island_pro_tips: tips };
}
