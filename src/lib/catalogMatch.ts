import type { CatalogItem } from '../types';

export interface IdentifiedNames {
  common_name?: string;
  scientific_name?: string;
  alternative_names?: string[];
}

/** Lowercase, strip accents and punctuation so "Hibisco rosa-de China" and "hibisco rosa de china" compare equal. */
export function normalizeName(value: string | undefined | null): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const BINOMIAL_SKIP = /^(var|spp|sp|subsp|cv|x)$/;
// Words that say nothing about the species. Matching on them alone would link unrelated plants.
const GENERIC = new Set([
  'planta', 'plant', 'tree', 'arbol', 'palm', 'palma', 'flower', 'flor', 'shrub', 'arbusto', 'common', 'comun',
  'china', 'chinese', 'rosa', 'rose', 'de', 'del', 'la', 'el', 'los', 'las', 'and', 'the', 'con', 'para', 'tropical',
]);

/** Genus stem: English "hibiscus" and Spanish "hibisco" share the first five letters. */
function stem(word: string): string {
  return word.length >= 6 ? word.slice(0, 5) : word;
}

function nameTokens(value: string): string[] {
  return normalizeName(value).split(' ').filter((w) => w.length > 3 && !GENERIC.has(w));
}

/**
 * Find nursery plants that match an identified specimen. Catalog entries are often named in Spanish and carry no
 * scientific name, so this compares accent-insensitive names and genus stems in addition to scientific names.
 * It never matches on broad words such as "palm" or "flower".
 */
export function findCatalogMatches(identified: IdentifiedNames[], catalog: CatalogItem[]): CatalogItem[] {
  const names = identified.filter(Boolean);
  const sciList = names
    .map((n) => normalizeName(n.scientific_name).split(' ').filter((w) => !BINOMIAL_SKIP.test(w)))
    .filter((p) => p.length > 0);
  const exactNames = new Set<string>();
  const stems = new Set<string>();
  for (const n of names) {
    for (const v of [n.common_name, ...(n.alternative_names || [])]) {
      const norm = normalizeName(v);
      if (norm) exactNames.add(norm);
      for (const tok of nameTokens(v || '')) stems.add(stem(tok));
    }
  }
  for (const parts of sciList) {
    if (parts[0] && parts[0].length > 3) stems.add(stem(parts[0]));
  }

  return catalog.filter((item) => {
    if (item.t !== 'plant') return false;
    const itemName = normalizeName(item.name);
    const itemSci = normalizeName(item.sci);
    if (!itemName && !itemSci) return false;

    // 1. Same scientific name (genus + species, or one name contains the other).
    for (const parts of sciList) {
      const full = parts.join(' ');
      if (itemSci && full && (itemSci === full || itemSci.startsWith(full) || full.startsWith(itemSci))) return true;
      if (parts.length >= 2 && itemSci.includes(parts[0]) && itemSci.includes(parts[1])) return true;
      // Catalog descriptions often spell out the full binomial.
      if (parts.length >= 2 && normalizeName(item.note).includes(parts[0] + ' ' + parts[1])) return true;
    }
    // 2. Same common name, in either language.
    if (itemName && exactNames.has(itemName)) return true;
    // 3. Catalog name shares the genus stem ("Hibisco rosa de China" ~ Hibiscus rosa-sinensis).
    const itemStems = [...nameTokens(item.name), ...nameTokens(item.sci).slice(0, 1)].map(stem);
    return itemStems.some((s) => stems.has(s));
  });
}
