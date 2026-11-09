// Source-level guards for dataset split integrity. These do not execute TensorFlow training.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const train = readFileSync(new URL('./train.py', import.meta.url), 'utf8');
const splitFunction = train.match(/def assign_group_splits[\\s\\S]*?\\n\\ndef make_dataset/);
assert.ok(splitFunction, 'assign_group_splits must remain present');
const source = splitFunction[0];

assert.match(source, /has_any_explicit_split = supplied_splits\\.ne\(""\)\\.any\(\)/);
assert.match(source, /has_all_explicit_splits = supplied_splits\\.ne\(""\)\\.all\(\)/);
assert.match(
  source,
  /has_any_explicit_split and not has_all_explicit_splits[\\s\\S]*?raise ValueError/,
  'partially populated split columns must fail instead of silently regenerating all splits'
);
assert.match(source, /result\\.groupby\("observation_group"\)\["split"\]\\.nunique\(\)/);
assert.match(source, /An observation_group appears in more than one split/);
assert.match(source, /Deterministic group split within each species/);

console.log('botanical training manifest guards passed (source-level; no model training performed)');
