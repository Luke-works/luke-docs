// ============================================================================
// Luke Docs — Cloudflare Worker access gate.
//
// Deployed on the route `docs.lukeflow.com/*`, in front of the existing Render
// *static* origin. It enforces the same identity core-ui uses: an unauthenticated
// request is sent to /login, the submitted username+password are forwarded
// (edge-to-service) to core-engine `GET /api/me`, and a signed HttpOnly session
// cookie is issued only when the caller is an operator (operator === true).
// Authenticated requests pass straight through to the static origin.
//
// Why the edge and not the static files: a static site has no server to check
// auth, so the check has to live in front of it. The Worker is that front.
//
// DEFAULT-LENIENT / FAIL-CLOSED: if the Worker is misconfigured (no session
// secret or no core-engine URL) it refuses to log anyone in rather than failing
// open. Local authoring (`npm run docs:dev`) never touches this.
// ============================================================================

const COOKIE_NAME = 'luke_docs_session';
const ENC = new TextEncoder();

const SEC_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

const MSG = {
  invalid: 'Incorrect username or password.',
  forbidden: 'That account is not a Lukeflow admin. Access is limited to operators.',
  unconfigured: 'Access is temporarily unavailable. Please contact the platform team.',
  upstream: 'Could not reach the identity service. Please try again shortly.',
  missing: 'Enter both a username and a password.',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const cfg = readConfig(env);

    if (path === '/healthz') return text('ok', 200);
    if (path === '/login') return handleLogin(request, url, cfg);
    if (path === '/logout') return redirect('/login', { 'Set-Cookie': clearCookie(COOKIE_NAME) });

    // Gate everything else (pages AND assets).
    const session = await verifySession(getCookie(request, COOKIE_NAME), cfg.secret);
    if (session) return passthrough(request, cfg);

    if (request.method === 'GET' || request.method === 'HEAD') {
      const next = safeNext(path + url.search);
      return redirect('/login?next=' + encodeURIComponent(next));
    }
    return text('Unauthorized', 401);
  },
};

// ---- Config ----------------------------------------------------------------
function readConfig(env) {
  return {
    coreEngineUrl: (env.DOCS_CORE_ENGINE_URL || '').replace(/\/+$/, ''),
    secret: env.DOCS_SESSION_SECRET || '',
    allowTenantAdmin: /^(1|true|yes)$/i.test(env.DOCS_ALLOW_TENANT_ADMIN || ''),
    ttlHours: Number(env.DOCS_SESSION_TTL_HOURS) || 12,
    origin: (env.DOCS_ORIGIN || '').replace(/\/+$/, ''),
    timeoutMs: Number(env.DOCS_UPSTREAM_TIMEOUT_MS) || 8000,
  };
}

// ---- Pass an authenticated request through to the static origin ------------
// With no DOCS_ORIGIN, fetch(request) is a same-zone subrequest — Cloudflare
// routes it to the origin and does NOT re-invoke this Worker (no loop).
function passthrough(request, cfg) {
  if (cfg.origin) {
    const u = new URL(request.url);
    return fetch(new Request(cfg.origin + u.pathname + u.search, request));
  }
  return fetch(request);
}

// ---- Login / auth ----------------------------------------------------------
async function handleLogin(request, url, cfg) {
  if (request.method === 'GET') {
    const next = safeNext(url.searchParams.get('next') || '/');
    if (await verifySession(getCookie(request, COOKIE_NAME), cfg.secret)) return redirect(next);
    return html(renderLogin({ next }));
  }
  if (request.method !== 'POST') return text('Method Not Allowed', 405);

  if (!cfg.secret || !cfg.coreEngineUrl) {
    return html(renderLogin({ next: '/', error: MSG.unconfigured }), 503);
  }
  const form = await request.formData();
  const next = safeNext((form.get('next') || '/').toString());
  const username = (form.get('username') || '').toString().trim();
  const password = (form.get('password') || '').toString();
  if (!username || !password) return html(renderLogin({ next, error: MSG.missing }), 400);

  const result = await checkAdmin(username, password, cfg);
  if (!result.ok) {
    const status = result.reason === 'invalid' || result.reason === 'forbidden' ? 401 : 503;
    return html(renderLogin({ next, error: MSG[result.reason] }), status);
  }
  const exp = Math.floor(Date.now() / 1000) + cfg.ttlHours * 3600;
  const token = await signSession({ u: result.userId, op: result.operator, exp }, cfg.secret);
  return redirect(next, { 'Set-Cookie': setCookie(COOKIE_NAME, token, cfg.ttlHours * 3600) });
}

// Ask core-engine whether these credentials are an admin.
// { ok:true, userId, operator } | { ok:false, reason:'invalid'|'forbidden'|'upstream' }
async function checkAdmin(username, password, cfg) {
  let resp;
  try {
    resp = await fetch(cfg.coreEngineUrl + '/api/me', {
      headers: { Authorization: basicAuth(username, password), Accept: 'application/json' },
      signal: AbortSignal.timeout(cfg.timeoutMs),
    });
  } catch {
    return { ok: false, reason: 'upstream' };
  }
  if (resp.status === 401) return { ok: false, reason: 'invalid' };
  if (!resp.ok) return { ok: false, reason: 'upstream' };
  let me;
  try {
    me = await resp.json();
  } catch {
    return { ok: false, reason: 'upstream' };
  }
  const isOperator = me?.operator === true;
  const isTenantAdmin =
    Array.isArray(me?.groups) && me.groups.some((g) => g?.type === 'ROLE' && g?.id === 'tenant-admin');
  if (isOperator || (cfg.allowTenantAdmin && isTenantAdmin)) {
    return { ok: true, userId: String(me.userId || username), operator: isOperator };
  }
  return { ok: false, reason: 'forbidden' };
}

// ---- Signed, stateless session (Web Crypto HMAC-SHA256) --------------------
async function hmacB64url(secret, dataStr) {
  const key = await crypto.subtle.importKey('raw', ENC.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, ENC.encode(dataStr));
  return b64urlBytes(new Uint8Array(sig));
}

async function signSession(payload, secret) {
  const body = b64urlBytes(ENC.encode(JSON.stringify(payload)));
  return body + '.' + (await hmacB64url(secret, body));
}

async function verifySession(token, secret) {
  if (!secret || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const expected = await hmacB64url(secret, body);
  if (!timingSafeEqual(mac, expected)) return null;
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(bytesFromB64url(body)));
  } catch {
    return null;
  }
  if (!payload || typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null;
  return payload;
}

// ---- Small helpers ---------------------------------------------------------
function b64urlBytes(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function bytesFromB64url(str) {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function basicAuth(user, pass) {
  let s = '';
  for (const b of ENC.encode(`${user}:${pass}`)) s += String.fromCharCode(b);
  return 'Basic ' + btoa(s);
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function getCookie(request, name) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i) === name) return part.slice(i + 1);
  }
  return null;
}
function setCookie(name, value, maxAgeSec) {
  return `${name}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}`;
}
function clearCookie(name) {
  return `${name}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}
function safeNext(next) {
  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return '/';
  return next;
}
const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---- Responses -------------------------------------------------------------
function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: { ...SEC_HEADERS, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
  });
}
function text(body, status = 200) {
  return new Response(body, { status, headers: { ...SEC_HEADERS, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}
function redirect(location, extra = {}) {
  return new Response(null, { status: 302, headers: { ...SEC_HEADERS, Location: location, 'Cache-Control': 'no-store', ...extra } });
}

// ---- Login page (self-contained; matches the docs' Camunda-blue theme) -----
function renderLogin({ next = '/', error = '' } = {}) {
  const banner = error ? `<p class="err" role="alert">${escapeHtml(error)}</p>` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Sign in · Luke Docs</title>
<style>
  :root { color-scheme: light dark; --brand:#0b6bcb; --brand-d:#0a5aad; --ink:#1b1f24; --muted:#5b6672;
    --bg:#f5f7fa; --card:#ffffff; --border:#e3e8ee; --err:#b42318; --err-bg:#fef3f2; }
  @media (prefers-color-scheme: dark) {
    :root { --brand:#4aa3e6; --brand-d:#2a7fc4; --ink:#e7edf3; --muted:#9aa7b4;
      --bg:#11151a; --card:#1a2027; --border:#2a333d; --err:#ff8a80; --err-bg:#2a1a1a; }
  }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; padding:24px;
    font-family:'Inter','Segoe UI',system-ui,-apple-system,sans-serif; color:var(--ink); background:var(--bg); }
  .card { width:100%; max-width:392px; background:var(--card); border:1px solid var(--border);
    border-radius:10px; padding:32px 30px; box-shadow:0 1px 2px rgba(16,24,40,.04),0 8px 24px rgba(16,24,40,.06); }
  .brand { display:flex; align-items:center; gap:10px; margin-bottom:22px; }
  .brand .dot { width:30px; height:30px; border-radius:7px; background:linear-gradient(120deg,#0b6bcb 30%,#14a0e8);
    display:grid; place-items:center; color:#fff; font-weight:800; font-size:15px; }
  .brand h1 { font-size:16px; margin:0; letter-spacing:-.01em; }
  .brand small { display:block; color:var(--muted); font-weight:500; font-size:12px; }
  label { display:block; font-size:13px; font-weight:600; margin:14px 0 6px; }
  input { width:100%; padding:10px 12px; font-size:14px; color:var(--ink); background:transparent;
    border:1px solid var(--border); border-radius:7px; outline:none; }
  input:focus { border-color:var(--brand); box-shadow:0 0 0 3px color-mix(in srgb,var(--brand) 22%,transparent); }
  button { width:100%; margin-top:20px; padding:11px 12px; font-size:14px; font-weight:700; color:#fff; cursor:pointer;
    background:var(--brand); border:1px solid var(--brand-d); border-radius:7px; }
  button:hover { background:var(--brand-d); }
  .err { margin:16px 0 0; padding:9px 12px; font-size:13px; color:var(--err); background:var(--err-bg);
    border:1px solid color-mix(in srgb,var(--err) 30%,transparent); border-radius:7px; }
  .hint { margin:18px 0 0; font-size:12px; color:var(--muted); line-height:1.5; text-align:center; }
</style>
</head>
<body>
  <form class="card" method="post" action="/login" autocomplete="on">
    <div class="brand">
      <span class="dot">L</span>
      <div><h1>Luke Docs</h1><small>Operators only — sign in to continue</small></div>
    </div>
    ${banner}
    <input type="hidden" name="next" value="${escapeHtml(next)}" />
    <label for="u">Username</label>
    <input id="u" name="username" type="text" autocapitalize="none" autocorrect="off" spellcheck="false"
      autocomplete="username" required autofocus />
    <label for="p">Password</label>
    <input id="p" name="password" type="password" autocomplete="current-password" required />
    <button type="submit">Sign in</button>
    <p class="hint">Use your Lukeflow core-engine admin credentials.</p>
  </form>
</body>
</html>`;
}
