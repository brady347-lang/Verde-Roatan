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

export interface CatalogMatches {
  /** Same species or same common name: safe to show as "in stock". */
  exact: CatalogItem[];
  /** Same genus but a different or unconfirmed species: show as "similar", never as the identified plant. */
  similar: CatalogItem[];
}

/**
 * Split nursery plants into exact matches and same-genus look-alikes for an identified specimen. Catalog entries are
 * often named in Spanish and carry no scientific name, so names are compared accent-insensitively and by genus stem.
 * A genus-only hit counts as exact only when the catalog name names no other species ("Hibisco", "Hibisco rosa de
 * China"); "Hibiscus syriacus" for a Hibiscus rosa-sinensis photo is only "similar". Broad words such as "palm" or
 * "flower" never match.
 */
export function classifyCatalogMatches(identified: IdentifiedNames[], catalog: CatalogItem[]): CatalogMatches {
  const names = identified.filter(Boolean);
  const sciList = names
    .map((n) => normalizeName(n.scientific_name).split(' ').filter((w) => !BINOMIAL_SKIP.test(w)))
    .filter((p) => p.length > 0);
  const exactNames = new Set<string>();
  const stems = new Set<string>();
  const epithets = new Set<string>();
  for (const n of names) {
    for (const v of [n.common_name, ...(n.alternative_names || [])]) {
      const norm = normalizeName(v);
      if (norm) exactNames.add(norm);
      for (const tok of nameTokens(v || '')) stems.add(stem(tok));
    }
  }
  for (const parts of sciList) {
    if (parts[0] && parts[0].length > 3) stems.add(stem(parts[0]));
    for (const e of parts.slice(1)) if (e.length > 3) epithets.add(e);
  }

  const exact: CatalogItem[] = [];
  const similar: CatalogItem[] = [];
  for (const item of catalog) {
    if (item.t !== 'plant') continue;
    const itemName = normalizeName(item.name);
    const itemSci = normalizeName(item.sci);
    if (!itemName && !itemSci) continue;

    // 1. Same scientific name (genus + species, or one name contains the other).
    let isExact = false;
    for (const parts of sciList) {
      const full = parts.join(' ');
      if (itemSci && full && (itemSci === full || itemSci.startsWith(full) || full.startsWith(itemSci))) isExact = true;
      if (parts.length >= 2 && itemSci.includes(parts[0]) && itemSci.includes(parts[1])) isExact = true;
      // Catalog descriptions often spell out the full binomial.
      if (parts.length >= 2 && normalizeName(item.note).includes(parts[0] + ' ' + parts[1])) isExact = true;
    }
    // 2. Same common name, in either language.
    if (itemName && exactNames.has(itemName)) isExact = true;
    if (isExact) { exact.push(item); continue; }

    // 3. Shares the genus stem. Exact only if the catalog entry names no other species.
    const itemTokens = [...nameTokens(item.name), ...nameTokens(item.sci)];
    const genusHit = itemTokens.map(stem).some((st) => stems.has(st));
    if (!genusHit) continue;
    const leftover = itemTokens.filter((t) => !stems.has(stem(t)));
    const conflicts = leftover.some((t) => !epithets.has(t) && !exactNames.has(t));
    (conflicts ? similar : exact).push(item);
  }
  return { exact, similar };
}

/** Exact matches only. */
export function findCatalogMatches(identified: IdentifiedNames[], catalog: CatalogItem[]): CatalogItem[] {
  return classifyCatalogMatches(identified, catalog).exact;
}
