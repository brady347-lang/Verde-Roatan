import type { CatalogItem, Language } from '../types';

/**
 * Language-aware catalog text. Only verified translations are shown: a missing Spanish field falls back to the
 * stored text and is never machine-translated. Scientific names are never localized.
 */
const clean = (v: unknown): string => String(v ?? '').trim();

export function localizedName(item: Pick<CatalogItem, 'name' | 'name_es'>, lang: Language): string {
  return lang === 'es' ? clean(item.name_es) || item.name : item.name;
}

/** The other-language common name, shown as secondary text when it differs from the primary one. */
export function secondaryName(item: Pick<CatalogItem, 'name' | 'name_es'>, lang: Language): string {
  const primary = localizedName(item, lang);
  const other = lang === 'es' ? item.name : clean(item.name_es);
  return other && other.toLowerCase() !== primary.toLowerCase() ? other : '';
}

export function localizedDescription(item: Pick<CatalogItem, 'note' | 'description_en' | 'description_es'>, lang: Language): string {
  const preferred = clean(lang === 'es' ? item.description_es : item.description_en);
  return preferred || clean(item.description_en) || clean(item.description_es) || clean(item.note);
}

export function localizedCare(item: Pick<CatalogItem, 'care_instructions_en' | 'care_instructions_es'>, lang: Language): string {
  const preferred = clean(lang === 'es' ? item.care_instructions_es : item.care_instructions_en);
  return preferred || clean(item.care_instructions_en) || clean(item.care_instructions_es);
}

export function alternativeNames(item: Pick<CatalogItem, 'alternative_names_en' | 'alternative_names_es'>, lang: Language): string[] {
  const list = lang === 'es' ? [...(item.alternative_names_es || []), ...(item.alternative_names_en || [])] : [...(item.alternative_names_en || []), ...(item.alternative_names_es || [])];
  return [...new Set(list.map(clean).filter(Boolean))];
}

/** Accept a Postgres text[] / JSON array or a comma-separated string from the API. */
export function toNameList(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,;|]/) : [];
  return raw.map(clean).filter(Boolean).slice(0, 20);
}

const BINOMIAL = /^[A-Z][a-z]{2,}(?:\s+(?:x\s+)?[a-z][a-z-]{2,})(?:\s+(?:subsp|var|f|cv)\.?\s+[A-Za-z'-]+)?(?:\s+['‘][^']{1,40}['’])?$/;

/**
 * The Latin name of a catalog item, or null. Legacy rows stored free text (often a Spanish description) in `sci`,
 * so `sci` only counts when it actually looks like a Latin binomial. Never feed free text to the knowledge queue as a taxon.
 */
export function scientificNameOf(item: Pick<CatalogItem, 'scientific_name' | 'sci'>): string | null {
  const explicit = clean(item.scientific_name);
  if (explicit) return explicit;
  const legacy = clean(item.sci);
  return legacy.length <= 80 && BINOMIAL.test(legacy) ? legacy : null;
}
