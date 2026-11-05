// Bulk botanical import: parsing, column mapping, validation and duplicate detection.
// Pure functions only (no network, no React) so they can be tested and re-used by the worker.
//
// Hard rules for this feature:
//  - Prices, stock, suppliers and nursery inventory photos are NEVER imported. Columns that look like
//    them are reported as "ignored" and dropped.
//  - Nothing is written without administrator approval, and existing records are never overwritten.

export type BotanicalField =
  | 'scientific_name' | 'common_name' | 'family' | 'genus' | 'species' | 'synonyms'
  | 'description' | 'habitat' | 'distribution' | 'sunlight' | 'water' | 'soil'
  | 'propagation' | 'toxicity' | 'pests_diseases' | 'climate' | 'growth_habit'
  | 'native_to_bay_islands' | 'references' | 'reference_photo_url';

export const FIELD_LABELS: Record<BotanicalField, string> = {
  scientific_name: 'Scientific name', common_name: 'Common name', family: 'Family', genus: 'Genus',
  species: 'Species', synonyms: 'Synonyms', description: 'Description', habitat: 'Habitat',
  distribution: 'Geographic distribution', sunlight: 'Sunlight', water: 'Water', soil: 'Soil',
  propagation: 'Propagation', toxicity: 'Toxicity', pests_diseases: 'Pests & diseases',
  climate: 'Climate suitability', growth_habit: 'Growth habit', native_to_bay_islands: 'Native to Bay Islands',
  references: 'Scientific references', reference_photo_url: 'Botanical reference photo (URL)'
};

export const REQUIRED_FIELDS: BotanicalField[] = ['scientific_name', 'common_name'];
export const RECOMMENDED_FIELDS: BotanicalField[] = ['family', 'sunlight', 'water', 'soil', 'description'];

// Header keywords (normalised: lower case, accents and punctuation removed) -> field.
const SYNONYMS: Record<BotanicalField, string[]> = {
  scientific_name: ['scientific name', 'scientificname', 'sci name', 'sci', 'latin name', 'latin', 'binomial', 'botanical name', 'taxon', 'species name', 'nombre cientifico', 'nombre botanico'],
  common_name: ['common name', 'commonname', 'name', 'plant name', 'plant', 'nombre comun', 'nombre', 'planta', 'vernacular name'],
  family: ['family', 'plant family', 'familia', 'botanical family'],
  genus: ['genus', 'genero'],
  species: ['species', 'specific epithet', 'epithet', 'especie'],
  synonyms: ['synonyms', 'synonym', 'also known as', 'aka', 'alternative names', 'alternate names', 'other names', 'sinonimos', 'otros nombres'],
  description: ['description', 'botanical description', 'notes', 'note', 'descripcion', 'summary', 'details'],
  habitat: ['habitat', 'ecology', 'ecosystem'],
  distribution: ['distribution', 'geographic distribution', 'range', 'native range', 'native to', 'origin', 'distribucion', 'region'],
  sunlight: ['sun', 'sunlight', 'light', 'light requirement', 'sun requirement', 'exposure', 'luz', 'sol'],
  water: ['water', 'watering', 'water requirement', 'water needs', 'irrigation', 'agua', 'riego'],
  soil: ['soil', 'soil requirement', 'soil type', 'substrate', 'suelo'],
  propagation: ['propagation', 'propagate', 'propagation method', 'reproduction', 'propagacion'],
  toxicity: ['toxicity', 'toxic', 'poisonous', 'pet safe', 'pet safety', 'toxicidad'],
  pests_diseases: ['pests', 'diseases', 'pests and diseases', 'pests diseases', 'pest disease', 'plagas', 'enfermedades'],
  climate: ['climate', 'climate suitability', 'hardiness', 'zone', 'clima', 'temperature'],
  growth_habit: ['growth habit', 'habit', 'growth form', 'form', 'type', 'plant type', 'category', 'kind', 'tipo'],
  native_to_bay_islands: ['native to bay islands', 'bay islands native', 'native bay islands', 'native roatan', 'native to roatan', 'nativa'],
  references: ['references', 'reference', 'source', 'sources', 'citation', 'citations', 'bibliography', 'referencias', 'fuente'],
  reference_photo_url: ['reference photo', 'reference image', 'botanical photo', 'photo url', 'image url', 'photo', 'image', 'picture', 'foto', 'imagen']
};

// Columns that must never be imported.
const FORBIDDEN: Array<{ re: RegExp; why: string }> = [
  { re: /\b(price|precio|cost|costo|msrp|wholesale|retail|usd|hnl|lempira|dollar)\b/, why: 'prices are never imported' },
  { re: /\b(stock|inventory|qty|quantity|units|cantidad|existencia|available|availability|inventario)\b/, why: 'stock quantities are never imported' },
  { re: /\b(supplier|vendor|nursery|proveedor|vivero|distributor|seller|source nursery)\b/, why: 'suppliers are never imported' },
  { re: /\b(sku|barcode|upc)\b/, why: 'inventory codes are never imported' }
];

export function normHeader(h: string): string {
  return String(h ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export interface ColumnMapping {
  /** source column index -> field (null = not imported) */
  map: Record<number, BotanicalField | null>;
  ignored: Array<{ column: string; reason: string }>;
  unmapped: string[];
}

export function suggestMapping(headers: string[]): ColumnMapping {
  const map: Record<number, BotanicalField | null> = {};
  const ignored: ColumnMapping['ignored'] = [];
  const unmapped: string[] = [];
  const taken = new Set<BotanicalField>();
  const norm = headers.map(normHeader);

  const forbiddenReason = (n: string) => FORBIDDEN.find((f) => f.re.test(n))?.why;

  // Pass 1: exact synonym matches (strongest first); pass 2: contained keywords.
  const attempt = (i: number, exact: boolean): BotanicalField | null => {
    const n = norm[i];
    let best: BotanicalField | null = null;
    let bestLen = 0;
    for (const field of Object.keys(SYNONYMS) as BotanicalField[]) {
      if (taken.has(field)) continue;
      for (const s of SYNONYMS[field]) {
        const hit = exact ? n === s : s.length >= 4 && (n.includes(s) || s.includes(n)) && n.length >= 3;
        if (hit && s.length > bestLen) { best = field; bestLen = s.length; }
      }
    }
    return best;
  };

  headers.forEach((h, i) => {
    const why = forbiddenReason(norm[i]);
    if (why && !SYNONYMS.common_name.includes(norm[i])) { map[i] = null; ignored.push({ column: h, reason: why }); }
  });
  for (const exact of [true, false]) {
    headers.forEach((h, i) => {
      if (i in map) return;
      const f = attempt(i, exact);
      if (f) { map[i] = f; taken.add(f); }
    });
  }
  headers.forEach((h, i) => { if (!(i in map)) { map[i] = null; if (h.trim()) unmapped.push(h); } });
  return { map, ignored, unmapped };
}

// ---------------------------------------------------------------------------------------------
// CSV parsing (RFC 4180: quotes, escaped quotes, CRLF, embedded newlines; auto-detects , ; or tab)
// ---------------------------------------------------------------------------------------------
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const first = src.split(/\r?\n/, 1)[0] || '';
  const counts = { ',': 0, ';': 0, '\t': 0 } as Record<string, number>;
  let q = false;
  for (const ch of first) { if (ch === '"') q = !q; else if (!q && ch in counts) counts[ch]++; }
  const delim = (Object.keys(counts) as string[]).sort((a, b) => counts[b] - counts[a])[0];
  const sep = counts[delim] > 0 ? delim : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQ = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQ) {
      if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
      else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      rows.push(row); row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

// ---------------------------------------------------------------------------------------------
// Scientific names
// ---------------------------------------------------------------------------------------------
export interface ParsedName {
  genus: string;
  species: string;
  /** "Genus species" (or "Genus species subsp. x" / "Genus × hybrid") in canonical case */
  canonical: string;
  valid: boolean;
  problems: string[];
}

const RANKS = ['subsp', 'ssp', 'var', 'f', 'cv'];

export function parseScientificName(raw: string): ParsedName {
  const problems: string[] = [];
  let s = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return { genus: '', species: '', canonical: '', valid: false, problems: ['Scientific name is missing'] };

  // Drop authorship in parentheses and trailing author citations like "L." or "(L.) Sm."
  s = s.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const cultivar = s.match(/'([^']+)'/);
  s = s.replace(/'[^']*'/g, ' ').replace(/\s+/g, ' ').trim();

  const tokens = s.split(' ');
  let genus = tokens[0] || '';
  if (/^[×x]$/i.test(genus) && tokens.length > 1) { genus = '× ' + tokens[1]; tokens.splice(0, 2, genus); }
  const bareGenus = genus.replace(/^×\s*/, '');

  if (!/^[A-Za-zÀ-ÿ-]+$/.test(bareGenus)) problems.push('Genus contains unexpected characters');
  if (bareGenus && bareGenus.length < 3) problems.push('Genus is too short');
  const fixedGenus = bareGenus ? bareGenus.charAt(0).toUpperCase() + bareGenus.slice(1).toLowerCase() : '';
  if (bareGenus && bareGenus !== fixedGenus) problems.push(`Capitalisation corrected to "${fixedGenus}"`);

  let species = '';
  let i = 1;
  if (/^[×x]$/i.test(tokens[i] || '') && tokens[i + 1]) i++;
  if (tokens[i] && /^[a-zà-ÿ-]+$/i.test(tokens[i]) && !/^(sp|spp|sp\.|spp\.)$/i.test(tokens[i])) {
    species = tokens[i].toLowerCase();
    if (tokens[i] !== species) problems.push('Species epithet should be lower case');
    i++;
  } else if (/^(sp|spp)\.?$/i.test(tokens[i] || '')) problems.push('Only the genus is identified (sp.)');
  else problems.push('Species epithet is missing');

  let infra = '';
  while (i < tokens.length) {
    const t = tokens[i].toLowerCase().replace(/\.$/, '');
    if (RANKS.includes(t) && tokens[i + 1] && /^[a-z-]+$/i.test(tokens[i + 1])) { infra += ` ${t === 'ssp' ? 'subsp' : t}. ${tokens[i + 1].toLowerCase()}`; i += 2; }
    else i++; // authorship text: ignored
  }

  const canonical = [fixedGenus && (genus.startsWith('×') ? '× ' : '') + fixedGenus, species].filter(Boolean).join(' ') + infra + (cultivar ? ` '${cultivar[1]}'` : '');
  const valid = !!fixedGenus && !!species && !problems.some((p) => /unexpected|too short|missing|Only the genus/.test(p));
  return { genus: fixedGenus, species, canonical: canonical.trim(), valid, problems };
}

export function nameKey(canonical: string): string {
  return canonical.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------------------------
// Rows, validation, duplicates
// ---------------------------------------------------------------------------------------------
export type Severity = 'error' | 'warning' | 'info';
export interface RowIssue { severity: Severity; field?: BotanicalField; message: string }

export interface ImportRow {
  rowNumber: number; // 1-based spreadsheet row (header = 1)
  values: Partial<Record<BotanicalField, string>>;
  issues: RowIssue[];
  key: string; // canonical name key for dedupe
  duplicate?: { kind: 'in_file' | 'existing'; of: string; detail: string };
  status: 'ready' | 'needs_review' | 'blocked';
  approved: boolean;
}

const clean = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim();

const TRUE = /^(1|true|yes|y|si|sí|x|native|nativa)$/i;
export function parseBool(v: string): boolean | null {
  if (!v) return null;
  if (TRUE.test(v)) return true;
  if (/^(0|false|no|n|introduced|exotic)$/i.test(v)) return false;
  return null;
}

export interface ExistingRecord { scientific_name: string; common_name?: string; source: 'catalog' | 'botanical' }

export function buildRows(table: string[][], mapping: ColumnMapping, existing: ExistingRecord[] = []): ImportRow[] {
  const existingByKey = new Map<string, ExistingRecord>();
  for (const e of existing) {
    const p = parseScientificName(e.scientific_name);
    if (p.canonical) existingByKey.set(nameKey(p.canonical), e);
  }
  const seen = new Map<string, number>();
  const rows: ImportRow[] = [];

  for (let r = 1; r < table.length; r++) {
    const values: Partial<Record<BotanicalField, string>> = {};
    for (const [colIdx, field] of Object.entries(mapping.map)) {
      if (!field) continue;
      const v = clean(table[r][Number(colIdx)]);
      if (v) values[field] = values[field] ? `${values[field]}; ${v}` : v;
    }
    if (Object.keys(values).length === 0) continue;
    rows.push(finalizeRow(r + 1, values, existingByKey, seen));
  }
  return rows;
}

/** Recomputes issues / duplicate state after the administrator edits a cell. */
export function finalizeRow(
  rowNumber: number,
  values: Partial<Record<BotanicalField, string>>,
  existingByKey: Map<string, ExistingRecord>,
  seen: Map<string, number>
): ImportRow {
  const issues: RowIssue[] = [];
  const v = { ...values };

  // Allow genus + species columns to build the scientific name.
  if (!v.scientific_name && v.genus && v.species) v.scientific_name = `${v.genus} ${v.species}`;
  const parsed = parseScientificName(v.scientific_name || '');
  if (!v.scientific_name) issues.push({ severity: 'error', field: 'scientific_name', message: 'Scientific name is missing' });
  else {
    for (const p of parsed.problems) {
      const hard = /unexpected|too short|missing|Only the genus/.test(p);
      issues.push({ severity: hard ? 'error' : 'info', field: 'scientific_name', message: p });
    }
    if (parsed.canonical && parsed.canonical !== v.scientific_name) v.scientific_name = parsed.canonical;
    if (parsed.genus) v.genus = parsed.genus;
    if (parsed.species) v.species = parsed.species;
  }
  if (!v.common_name) issues.push({ severity: 'error', field: 'common_name', message: 'Common name is missing' });
  for (const f of RECOMMENDED_FIELDS) if (!v[f]) issues.push({ severity: 'warning', field: f, message: `${FIELD_LABELS[f]} is missing` });
  if (v.genus && v.family && /^(.*)(aceae|idae)$/i.test(v.genus)) issues.push({ severity: 'warning', field: 'genus', message: 'Genus looks like a family name' });
  if (v.family && !/^[A-Z][a-z]+(aceae|ae)$/.test(v.family)) issues.push({ severity: 'warning', field: 'family', message: 'Family names normally end in "-aceae" (check spelling/case)' });
  if (v.native_to_bay_islands && parseBool(v.native_to_bay_islands) === null) issues.push({ severity: 'warning', field: 'native_to_bay_islands', message: 'Use yes/no for native status' });
  if (v.reference_photo_url && !/^https:\/\//i.test(v.reference_photo_url)) issues.push({ severity: 'warning', field: 'reference_photo_url', message: 'Reference photo must be an https:// link; it will be skipped' });

  const key = parsed.canonical ? nameKey(parsed.canonical) : '';
  let duplicate: ImportRow['duplicate'];
  if (key) {
    const ex = existingByKey.get(key);
    if (ex) duplicate = { kind: 'existing', of: ex.scientific_name, detail: `Already in ${ex.source === 'catalog' ? 'the plant catalog' : 'botanical records'}${ex.common_name ? ` as "${ex.common_name}"` : ''}. It will NOT be overwritten.` };
    else if (seen.has(key)) duplicate = { kind: 'in_file', of: parsed.canonical, detail: `Same plant as row ${seen.get(key)} in this file.` };
    else seen.set(key, rowNumber);
  }
  if (duplicate) issues.push({ severity: 'error', message: duplicate.detail });

  const blocked = issues.some((i) => i.severity === 'error');
  const status: ImportRow['status'] = blocked ? 'blocked' : issues.some((i) => i.severity === 'warning') ? 'needs_review' : 'ready';
  return { rowNumber, values: v, issues, key, duplicate, status, approved: false };
}

export function summarize(rows: ImportRow[]) {
  return {
    total: rows.length,
    ready: rows.filter((r) => r.status === 'ready').length,
    needsReview: rows.filter((r) => r.status === 'needs_review').length,
    blocked: rows.filter((r) => r.status === 'blocked').length,
    duplicates: rows.filter((r) => r.duplicate).length,
    approved: rows.filter((r) => r.approved && r.status !== 'blocked').length
  };
}

/** Only these keys ever leave the browser. Prices/stock/suppliers cannot be added here. */
export function toCommitPayload(rows: ImportRow[]) {
  return rows
    .filter((r) => r.approved && r.status !== 'blocked')
    .map((r) => {
      const v = r.values;
      const split = (s?: string) => (s ? s.split(/[;|]/).map((x) => x.trim()).filter(Boolean) : []);
      return {
        scientific_name: v.scientific_name!,
        genus: v.genus || null,
        species: v.species || null,
        common_name: v.common_name!,
        family: v.family || null,
        synonyms: split(v.synonyms),
        description: v.description || null,
        habitat: v.habitat || null,
        distribution: v.distribution || null,
        sunlight: v.sunlight || null,
        water: v.water || null,
        soil: v.soil || null,
        propagation: v.propagation || null,
        toxicity: v.toxicity || null,
        pests_diseases: v.pests_diseases || null,
        climate: v.climate || null,
        growth_habit: v.growth_habit || null,
        native_to_bay_islands: v.native_to_bay_islands ? parseBool(v.native_to_bay_islands) : null,
        references: split(v.references),
        reference_photo_url: v.reference_photo_url && /^https:\/\//i.test(v.reference_photo_url) ? v.reference_photo_url : null,
        source_row: r.rowNumber
      };
    });
}

// ---------------------------------------------------------------------------------------------
// Editing support and AI-mapping sanitising
// ---------------------------------------------------------------------------------------------
export interface RowInput { rowNumber: number; values: Partial<Record<BotanicalField, string>>; approved: boolean }

/** Rebuilds every row's issues + duplicate flags from the current cell values (so edits take effect immediately). */
export function recomputeRows(inputs: RowInput[], existing: ExistingRecord[]): ImportRow[] {
  const existingByKey = new Map<string, ExistingRecord>();
  for (const e of existing) {
    const p = parseScientificName(e.scientific_name);
    if (p.canonical) existingByKey.set(nameKey(p.canonical), e);
  }
  const seen = new Map<string, number>();
  return inputs.map((i) => {
    const row = finalizeRow(i.rowNumber, i.values, existingByKey, seen);
    row.approved = i.approved && row.status !== 'blocked';
    return row;
  });
}

export function rowInputsFromRows(rows: ImportRow[]): RowInput[] {
  return rows.map((r) => ({ rowNumber: r.rowNumber, values: { ...r.values }, approved: false }));
}

/** Converts an AI suggestion ({header: field|null}) into a mapping, enforcing the same safety rules. */
export function mappingFromAi(headers: string[], ai: Record<string, string | null | undefined>): ColumnMapping {
  const base = suggestMapping(headers); // keeps the forbidden-column list
  const forbiddenIdx = new Set(base.ignored.map((x) => headers.indexOf(x.column)));
  const map: Record<number, BotanicalField | null> = {};
  const used = new Set<BotanicalField>();
  const valid = new Set(Object.keys(SYNONYMS));
  const unmapped: string[] = [];
  headers.forEach((h, i) => {
    const f = ai[h];
    if (!forbiddenIdx.has(i) && typeof f === 'string' && valid.has(f) && !used.has(f as BotanicalField)) {
      map[i] = f as BotanicalField;
      used.add(f as BotanicalField);
    } else {
      map[i] = null;
      if (!forbiddenIdx.has(i) && h.trim()) unmapped.push(h);
    }
  });
  return { map, ignored: base.ignored, unmapped };
}

export function isForbiddenHeader(h: string): string | null {
  const n = normHeader(h);
  if (SYNONYMS.common_name.includes(n)) return null;
  return FORBIDDEN.find((f) => f.re.test(n))?.why ?? null;
}

/** Converts a spreadsheet cell (string, number, boolean, Date, null) to text. */
export function cellToString(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}
