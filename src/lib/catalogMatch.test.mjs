import assert from 'node:assert/strict';
import { classifyCatalogMatches as classify } from './catalogMatch.ts';
const mk = (name, sci = '', note = '') => ({ id: name, t: 'plant', name, sci, note });
const names = (list) => list.map((x) => x.name);
const catalog = [mk('Hibisco'), mk('Hibisco rosa de China'), mk('Hibiscus syriacus', 'Hibiscus syriacus'), mk('Palo borracho', '', 'se asemeja a las flores de hibisco'), mk('Ficus elastica', 'Ficus elastica'), mk('Ficus benjamina', 'Ficus benjamina'), mk('Vanuatu Fan Palm', 'Licuala grandis'), mk('Areca Palm', 'Dypsis lutescens')];
let n = 0; const t = (name, fn) => { fn(); console.log('ok', ++n, name); };
t('Chinese Hibiscus finds the Spanish catalog names; another Hibiscus species is only similar', () => {
  const r = classify([{ common_name: 'Chinese Hibiscus', scientific_name: 'Hibiscus rosa-sinensis' }], catalog);
  assert.deepEqual(names(r.exact), ['Hibisco', 'Hibisco rosa de China']);
  assert.deepEqual(names(r.similar), ['Hibiscus syriacus']);
});
t('a description that merely mentions hibisco does not match', () => {
  const r = classify([{ common_name: 'Chinese Hibiscus', scientific_name: 'Hibiscus rosa-sinensis' }], catalog);
  assert.ok(![...r.exact, ...r.similar].some((x) => x.name === 'Palo borracho'));
});
t('same genus, different species is similar, never exact', () => {
  const r = classify([{ common_name: 'Weeping Fig', scientific_name: 'Ficus benjamina' }], catalog);
  assert.deepEqual(names(r.exact), ['Ficus benjamina']);
  assert.deepEqual(names(r.similar), ['Ficus elastica']);
});
t('scientific name match works; unrelated plants and broad words match nothing', () => {
  assert.deepEqual(names(classify([{ common_name: 'Fan Palm', scientific_name: 'Licuala grandis' }], catalog).exact), ['Vanuatu Fan Palm']);
  const none = classify([{ common_name: 'Coconut Palm', scientific_name: 'Cocos nucifera' }], catalog);
  assert.equal(none.exact.length + none.similar.length, 0);
});
console.log(`ALL ${n} PASSED`);
