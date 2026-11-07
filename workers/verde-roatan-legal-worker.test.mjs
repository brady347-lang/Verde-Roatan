import assert from 'node:assert/strict';
import worker from './verde-roatan-legal-worker.js';
let n = 0; const t = async (name, fn) => { await fn(); console.log('ok', ++n, name); };
const get = (p, method = 'GET') => worker.fetch(new Request('https://w.test' + p, { method }));
await t('privacy page is public HTML with contact, processors and deletion link', async () => {
  const r = await get('/privacy'); const h = await r.text();
  assert.equal(r.status, 200); assert.match(r.headers.get('content-type'), /text\/html/);
  assert.match(h, /Privacy Policy/); assert.match(h, /Gemini/); assert.match(h, /href="\/delete-account"/); assert.match(h, /Pol[ií]tica de privacidad/);
});
await t('delete-account page explains in-app path, what is kept, and email fallback', async () => {
  const h = await (await get('/delete-account')).text();
  assert.match(h, /Delete my account/); assert.match(h, /Order records are kept/); assert.match(h, /within 30 days/);
});
await t('root serves the privacy policy; unknown paths 404; writes refused; strict CSP', async () => {
  assert.equal((await get('/')).status, 200); assert.equal((await get('/nope')).status, 404);
  assert.equal((await get('/privacy', 'POST')).status, 405);
  assert.match((await get('/privacy')).headers.get('content-security-policy'), /default-src 'none'/);
});
console.log(`ALL ${n} PASSED`);
