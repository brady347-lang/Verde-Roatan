import assert from 'node:assert/strict';
import { localizedName, secondaryName, localizedDescription, localizedCare, alternativeNames, toNameList } from './catalogLocale.ts';
import { matchesQuery } from './botanicalRules.ts';
let n = 0; const t = (name, fn) => { fn(); console.log('ok', ++n, name); };
const full = { id: '1', t: 'plant', name: 'Chinese Hibiscus', name_es: 'Hibisco', scientific_name: 'Hibiscus rosa-sinensis', sci: 'Hibiscus rosa-sinensis', note: 'legacy note', description_en: 'Showy shrub.', description_es: 'Arbusto vistoso.', care_instructions_en: 'Water twice a week.', care_instructions_es: 'Regar dos veces por semana.', alternative_names_en: ['Shoeblack plant'], alternative_names_es: ['Cayena'], category: 'Flowers', kind: 'flower', sun: 'Full', tags: [] };
const legacy = { id: '2', t: 'plant', name: 'Blue Plumbago', sci: 'Arbusto con flores azules', note: 'Arbusto con flores azules', category: 'Shrubs', kind: 'shrub', sun: 'Full', tags: [] };
t('names follow the selected language and fall back without inventing', () => {
  assert.equal(localizedName(full, 'es'), 'Hibisco');
  assert.equal(localizedName(full, 'en'), 'Chinese Hibiscus');
  assert.equal(localizedName(legacy, 'es'), 'Blue Plumbago');
  assert.equal(secondaryName(full, 'es'), 'Chinese Hibiscus');
  assert.equal(secondaryName(full, 'en'), 'Hibisco');
  assert.equal(secondaryName(legacy, 'es'), '');
});
t('scientific names are never localized', () => {
  assert.equal(full.scientific_name, 'Hibiscus rosa-sinensis');
  assert.equal(localizedName({ name: 'Hibiscus rosa-sinensis', name_es: '' }, 'es'), 'Hibiscus rosa-sinensis');
});
t('descriptions and care follow the language, then fall back to stored text', () => {
  assert.equal(localizedDescription(full, 'es'), 'Arbusto vistoso.');
  assert.equal(localizedDescription(full, 'en'), 'Showy shrub.');
  assert.equal(localizedDescription(legacy, 'en'), 'Arbusto con flores azules');
  assert.equal(localizedDescription({ note: 'n', description_es: 'Solo español' }, 'en'), 'Solo español');
  assert.equal(localizedCare(full, 'es'), 'Regar dos veces por semana.');
  assert.equal(localizedCare(legacy, 'es'), '');
});
t('alternative names merge both languages, preferred language first, no duplicates', () => {
  assert.deepEqual(alternativeNames(full, 'es'), ['Cayena', 'Shoeblack plant']);
  assert.deepEqual(alternativeNames(full, 'en'), ['Shoeblack plant', 'Cayena']);
  assert.deepEqual(toNameList('a, b;a| '), ['a', 'b', 'a']);
  assert.deepEqual(toNameList(['x', ' ', 'y']), ['x', 'y']);
  assert.deepEqual(toNameList(null), []);
});
t('search finds plants by English, Spanish, alternative and scientific names (accent-insensitive)', () => {
  for (const q of ['chinese hibiscus', 'hibisco', 'cayena', 'shoeblack', 'rosa-sinensis', 'HIBISCUS', 'Cáyena']) assert.ok(matchesQuery(full, q), q);
  assert.ok(!matchesQuery(full, 'plumbago'));
});
t('legacy rows with no translations still work and are searchable', () => {
  assert.ok(matchesQuery(legacy, 'plumbago'));
  assert.equal(localizedName(legacy, 'en'), 'Blue Plumbago');
});
console.log(`ALL ${n} PASSED`);
