import assert from 'node:assert/strict';
import { readStoredTheme, applyTheme, THEME_STORAGE_KEY } from './theme.ts';
let n = 0; const t = (name, fn) => { fn(); console.log('ok', ++n, name); };
const store = (v) => ({ getItem: (k) => (k === THEME_STORAGE_KEY ? v : null) });
const root = () => { const a = {}; return { a, setAttribute: (k, v) => { a[k] = v; }, removeAttribute: (k) => { delete a[k]; } }; };
t('saved light and dark persist; anything else is system', () => {
  assert.equal(readStoredTheme(store('light')), 'light');
  assert.equal(readStoredTheme(store('dark')), 'dark');
  assert.equal(readStoredTheme(store('system')), 'system');
  assert.equal(readStoredTheme(store('purple')), 'system');
  assert.equal(readStoredTheme(store(null)), 'system');
});
t('missing or throwing storage falls back to system', () => {
  assert.equal(readStoredTheme(null), 'system');
  assert.equal(readStoredTheme(undefined), 'system');
  assert.equal(readStoredTheme({ getItem() { throw new Error('blocked'); } }), 'system');
});
t('light and dark set data-theme; system removes it so the device preference applies', () => {
  const r = root();
  applyTheme(r, 'dark'); assert.equal(r.a['data-theme'], 'dark');
  applyTheme(r, 'light'); assert.equal(r.a['data-theme'], 'light');
  applyTheme(r, 'system'); assert.equal('data-theme' in r.a, false);
});
import { readFileSync } from 'node:fs';
t('index.css defines the token set for light, dark override and system dark', () => {
  const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
  for (const token of ['--bg', '--surface', '--ink', '--ink-soft', '--line', '--palm', '--on-palm', '--note-ink']) {
    assert.ok((css.match(new RegExp(token + ':', 'g')) || []).length >= 3, token + ' must be defined for light, system-dark and forced dark');
  }
  assert.match(css, /prefers-color-scheme: dark\)[\s\S]*:root:not\(\[data-theme="light"\]\)/);
});
console.log(`ALL ${n} PASSED`);
