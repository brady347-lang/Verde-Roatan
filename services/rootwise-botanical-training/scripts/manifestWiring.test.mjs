// Source-level guards for dataset split integrity. These do not execute TensorFlow training.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const train = readFileSync(new URL('./train.py', import.meta.url), 'utf8');
const start = train.indexOf('def assign_group_splits');
const end = train.indexOf('\n\ndef make_dataset', start);
assert.ok(start >= 0 && end > start, 'assign_group_splits must remain present');
const source = train.slice(start, end);

for (const fragment of [
  'has_any_explicit_split = supplied_splits.ne("").any()',
  'has_all_explicit_splits = supplied_splits.ne("").all()',
  'has_any_explicit_split and not has_all_explicit_splits',
  'The split column is partially populated.',
  'result.groupby("observation_group")["split"].nunique()',
  'An observation_group appears in more than one split',
  'Deterministic group split within each species'
]) {
  assert.ok(source.includes(fragment), `missing dataset split integrity guard: ${fragment}`);
}

console.log('botanical training manifest guards passed (source-level; no model training performed)');
