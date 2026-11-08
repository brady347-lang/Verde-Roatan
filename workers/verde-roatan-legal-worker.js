/**
 * Verde Roatán Legal Worker: serves the public Privacy Policy and the Account Deletion page that
 * Google Play requires as web links. Static, read-only, no database, no secrets, no AI.
 */
const CONTACT_EMAIL = 'brady347@gmail.com'; // owner contact shown on both pages; change here if needed
// Publishable/anon key only: safe for browser use. Never place a service-role key in this Worker.
const SUPABASE_URL = 'https://tjzqxsyxvfdabfguezmu.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_vj7nV0g2fbPF11TfKtalKQ_BMUbQ8RD';
const UPDATED = 'November 7, 2026';

const STYLE = `:root{--bg:#f6f8f5;--ink:#16231b;--soft:#4a5a50;--card:#fff;--line:#dbe5dd;--palm:#2f8f66}
@media(prefers-color-scheme:dark){:root{--bg:#0f1a14;--ink:#e8f1ea;--soft:#a5b8ab;--card:#16241c;--line:#27382d;--palm:#4fc08d}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:720px;margin:0 auto;padding:24px 16px 64px}h1{font-size:26px;margin:.2em 0}h2{font-size:18px;margin:1.6em 0 .3em;color:var(--palm)}
p,li{color:var(--ink)}.soft{color:var(--soft);font-size:14px}a{color:var(--palm)}.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px}
nav a{margin-right:14px;font-weight:600}`;

const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Verde Roatán</title><style>${STYLE}</style></head><body><main><nav><a href="/privacy">Privacy</a><a href="/delete-account">Delete account</a><a href="/reset-password">Reset password</a></nav>${body}</main></body></html>`;

const PRIVACY = page('Privacy Policy', `
<h1>Privacy Policy</h1><p class="soft">Verde Roatán · Last updated ${UPDATED}</p>
<p>Verde Roatán is a plant nursery and landscaping app for Roatán, Honduras. This page explains what we collect and why.</p>
<h2>What we collect</h2><ul>
<li><b>Account:</b> email, password (stored by our sign-in provider, never visible to us) and your name.</li>
<li><b>Orders and requests:</b> phone/WhatsApp number, delivery neighborhood or address, notes, and what you ordered or asked for.</li>
<li><b>Plant photos:</b> photos you choose to scan, and your feedback on the result.</li></ul>
<h2>How we use it</h2><p>To run your account, prepare and deliver orders, quote landscaping work, identify plants, and improve our plant knowledge base. We do not sell personal data and we do not show ads.</p>
<h2>Plant identification</h2><p>A photo you scan is sent to Google's Gemini service to suggest what it shows. A suggestion is an estimate, not a scientific verification.</p>
<h2>Who processes data for us</h2><ul><li>Supabase: database and sign-in</li><li>Cloudflare: hosting and our servers</li><li>Google (Gemini): photo analysis</li></ul>
<p>Suppliers and landscapers only see what they need to fill an order or request, not your account details.</p>
<h2>Keeping it safe</h2><p>Data is encrypted in transit and protected by database access rules. Only authorized administrators can see customer details.</p>
<h2>Your choices</h2><p>You can delete your account inside the app (Account → Privacy &amp; data → Delete my account), or follow the steps on the <a href="/delete-account">account deletion page</a>. You can also ask us to access or correct your data at <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>
<h2>Children</h2><p>The app is not directed to children under 13.</p>
<h2>Changes</h2><p>If this policy changes, the date above changes.</p>
<h2>Contact</h2><p><a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
<hr><h1>Política de privacidad</h1>
<p>Verde Roatán es una app de vivero y paisajismo en Roatán, Honduras. Recopilamos: correo y nombre de la cuenta; teléfono, dirección o barrio de entrega y detalles de pedidos y solicitudes; y las fotos de plantas que decidas escanear. Las usamos para gestionar tu cuenta, entregar pedidos, cotizar trabajos de jardinería e identificar plantas. No vendemos datos personales. Las fotos se envían a Google (Gemini) para sugerir una identificación; es una estimación, no una verificación científica. Procesan datos Supabase (base de datos e inicio de sesión), Cloudflare (servidores) y Google (Gemini). Puedes eliminar tu cuenta en la app (Cuenta → Privacidad y datos → Eliminar mi cuenta) o escribir a <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>`);

const DELETE = page('Delete your account', `
<h1>Delete your account</h1><p class="soft">Verde Roatán · Last updated ${UPDATED}</p>
<div class="card"><b>Fastest way: inside the app</b><ol><li>Open Verde Roatán and sign in.</li><li>Go to <b>Account</b> → <b>Privacy &amp; data</b>.</li><li>Tap <b>Delete my account</b>, type DELETE and confirm.</li></ol></div>
<h2>What is deleted</h2><ul><li>Your account and sign-in.</li><li>Your landscaping service requests.</li><li>Your saved plant identifications and scan history.</li></ul>
<h2>What is kept</h2><ul><li>Order records are kept for the business's accounting, with your name, phone, address and notes removed.</li><li>If you confirmed or disputed an identification result, that review entry is held in a separate secured database for quality review. Ask us below to remove it.</li></ul>
<h2>Can't open the app?</h2><p>Email <a href="mailto:${CONTACT_EMAIL}?subject=Delete%20my%20Verde%20Roat%C3%A1n%20account">${CONTACT_EMAIL}</a> from the address you signed up with, with the subject "Delete my Verde Roatán account". We will delete your data within 30 days and confirm by email.</p>
<hr><h1>Eliminar tu cuenta</h1><p>En la app: <b>Cuenta</b> → <b>Privacidad y datos</b> → <b>Eliminar mi cuenta</b>. Se eliminan tu cuenta, tus solicitudes de servicio y tus identificaciones. Los pedidos se conservan sin tu nombre, teléfono ni dirección. Si no puedes abrir la app, escribe a <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> desde el correo de tu cuenta y lo eliminaremos en un plazo de 30 días.</p>`);


const RESET = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reset password · RootWise</title><style>\${STYLE}form{display:grid;gap:12px;margin-top:18px}input,button{font:inherit;padding:12px;border:1px solid var(--line);border-radius:10px}button{background:var(--palm);color:white;font-weight:700;cursor:pointer}button:disabled{opacity:.6}#status{padding:12px;border-radius:10px;background:var(--card);overflow-wrap:anywhere}.hidden{display:none}</style></head><body><main><nav><a href="/privacy">Privacy</a><a href="/delete-account">Delete account</a></nav><h1>Reset your password</h1><p class="soft">Enter your account email and we’ll send a secure reset link. If you opened this page from a reset email, choose a new password below.</p><section id="request"><form id="requestForm"><label for="email">Account email</label><input id="email" type="email" autocomplete="email" required><button id="send" type="submit">Send reset link</button></form></section><section id="change" class="hidden"><form id="changeForm"><label for="password">New password (at least 8 characters)</label><input id="password" type="password" minlength="8" autocomplete="new-password" required><label for="confirm">Confirm new password</label><input id="confirm" type="password" minlength="8" autocomplete="new-password" required><button id="save" type="submit">Save new password</button></form></section><p id="status" role="status" aria-live="polite"></p><script>
const SUPABASE_URL = 'https://tjzqxsyxvfdabfguezmu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_vj7nV0g2fbPF11TfKtalKQ_BMUbQ8RD';
const $ = id => document.getElementById(id);
const say = (message, bad=false) => { $('status').textContent=message; $('status').style.color=bad?'#b42318':'var(--ink)'; };
const redirectUrl = location.origin + '/reset-password';
const params = new URLSearchParams(location.hash.slice(1));
const accessToken = params.get('access_token');
const recoveryType = params.get('type') === 'recovery';
if (accessToken && recoveryType) {
  $('request').classList.add('hidden');
  $('change').classList.remove('hidden');
  history.replaceState(null, '', location.pathname);
  say('Choose a new password for your account.');
} else if (new URLSearchParams(location.search).has('error_description')) {
  say(new URLSearchParams(location.search).get('error_description'), true);
}
$('requestForm').addEventListener('submit', async e => {
  e.preventDefault(); $('send').disabled=true;
  try {
    const email=$('email').value.trim();
    const response=await fetch(SUPABASE_URL+'/auth/v1/recover?redirect_to='+encodeURIComponent(redirectUrl), {
      method:'POST', headers:{'Content-Type':'application/json','apikey':SUPABASE_KEY}, body:JSON.stringify({email})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data.msg||data.message||data.error_description||'Could not request a password reset.');
    say('If an account exists for that email, a password reset link has been sent. Check your inbox and spam folder.');
  } catch(err) { say(err.message||'Could not request a password reset.',true); }
  finally { $('send').disabled=false; }
});
$('changeForm').addEventListener('submit', async e => {
  e.preventDefault();
  const password=$('password').value, confirm=$('confirm').value;
  if(password.length<8){say('Use at least 8 characters.',true);return;}
  if(password!==confirm){say('The passwords do not match.',true);return;}
  $('save').disabled=true;
  try {
    const response=await fetch(SUPABASE_URL+'/auth/v1/user', {
      method:'PUT', headers:{'Content-Type':'application/json','apikey':SUPABASE_KEY,'Authorization':'Bearer '+accessToken}, body:JSON.stringify({password})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data.msg||data.message||data.error_description||'Could not update your password.');
    $('change').classList.add('hidden');
    say('Your password has been updated. Return to RootWise and sign in with your new password.');
  } catch(err) { say(err.message||'Could not update your password.',true); }
  finally { $('save').disabled=false; }
});
</script></main></body></html>`;
const RESET_HEADERS = {
  'Content-Type':'text/html; charset=utf-8',
  'Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff',
  'Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src https://tjzqxsyxvfdabfguezmu.supabase.co; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'Referrer-Policy':'no-referrer'
};

const HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'public, max-age=300',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer'
};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    if (path === '/' || path === '/privacy') return new Response(request.method === 'HEAD' ? null : PRIVACY, { headers: HEADERS });
    if (path === '/delete-account') return new Response(request.method === 'HEAD' ? null : DELETE, { headers: HEADERS });
    if (path === '/reset-password') return new Response(request.method === 'HEAD' ? null : RESET, { headers: RESET_HEADERS });
    if (path === '/health') return new Response('ok', { headers: { 'Content-Type': 'text/plain' } });
    return new Response('Not found', { status: 404 });
  }
};
