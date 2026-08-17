// ============================================================================
// Luke Docs — authenticated static server.
//
// This wraps the built VitePress site (`.vitepress/dist`) in a login gate so the
// manual is only readable by a Lukeflow **operator/admin**. It is the same identity
// core-ui uses: the browser submits a core-engine username + password, this server
// forwards them to core-engine `GET /api/me` (server-to-server — so CORS never
// applies), and only issues a session if `operator === true`.
//
// Why a server and not a client-side guard: the docs are a *static* build, so any
// in-page JS gate is cosmetic — the HTML/JS is already in the browser. Real access
// control has to live in front of the files, which is what this process does.
//
// DEFAULT-LENIENT boot: the server always starts. If it is misconfigured
// (no DOCS_CORE_ENGINE_URL) it fails **closed** — nobody can log in — rather than
// failing open or crash-looping.
// ============================================================================

import { createServer } from 'node:http';
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import cookieParser from 'cookie-parser';
import sirv from 'sirv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, '..', '.vitepress', 'dist');

// ---- Config (env only; every knob has a safe default) ----------------------
const PORT = Number(process.env.PORT) || 4173;
const CORE_ENGINE_URL = (process.env.DOCS_CORE_ENGINE_URL || '').replace(/\/+$/, '');
const TTL_HOURS = Number(process.env.DOCS_SESSION_TTL_HOURS) || 12;
const UPSTREAM_TIMEOUT_MS = Number(process.env.DOCS_UPSTREAM_TIMEOUT_MS) || 8000;
// When true, org-admins (a `tenant-admin` ROLE group) are allowed in too, not just operators.
const ALLOW_TENANT_ADMIN = /^(1|true|yes)$/i.test(process.env.DOCS_ALLOW_TENANT_ADMIN || '');
const COOKIE_NAME = 'luke_docs_session';

// Signing secret: use the configured one, else mint an ephemeral per-boot key so
// dev works. Ephemeral means sessions don't survive a restart / a second instance —
// prod must set DOCS_SESSION_SECRET (render.yaml uses generateValue).
let SESSION_SECRET = process.env.DOCS_SESSION_SECRET || '';
if (!SESSION_SECRET) {
  SESSION_SECRET = randomBytes(32).toString('hex');
  console.warn('[luke-docs] DOCS_SESSION_SECRET is unset — using an ephemeral key; sessions reset on restart.');
}
if (!CORE_ENGINE_URL) {
  console.warn('[luke-docs] DOCS_CORE_ENGINE_URL is unset — login is DISABLED (fail-closed). Set it to enable access.');
}

// ---- Stateless signed session token: base64url(payload).base64url(hmac) -----
const b64url = (buf) => Buffer.from(buf).toString('base64url');

function signSession(payload) {
  const body = b64url(JSON.stringify(payload));
  const mac = b64url(createHmac('sha256', SESSION_SECRET).update(body).digest());
  return `${body}.${mac}`;
}

function verifySession(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const expected = b64url(createHmac('sha256', SESSION_SECRET).update(body).digest());
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null;
  return payload;
}

// ---- Small helpers ---------------------------------------------------------
const isHttps = (req) => (req.headers['x-forwarded-proto'] || req.protocol) === 'https';

function setSessionCookie(req, res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttps(req),
    path: '/',
    maxAge: TTL_HOURS * 3600 * 1000,
  });
}

function clearSessionCookie(req, res) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'lax', secure: isHttps(req), path: '/' });
}

// Open-redirect guard: only same-origin absolute paths are allowed as `next`.
function safeNext(next) {
  if (typeof next !== 'string') return '/';
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return '/';
  return next;
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---- Ask core-engine whether these credentials are an admin ----------------
// Returns { ok: true, userId } | { ok: false, reason: 'invalid'|'forbidden'|'unconfigured'|'upstream' }
async function checkAdmin(username, password) {
  if (!CORE_ENGINE_URL) return { ok: false, reason: 'unconfigured' };
  const basic = Buffer.from(`${username}:${password}`).toString('base64');
  let resp;
  try {
    resp = await fetch(`${CORE_ENGINE_URL}/api/me`, {
      headers: { Authorization: `Basic ${basic}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
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
  if (isOperator || (ALLOW_TENANT_ADMIN && isTenantAdmin)) {
    return { ok: true, userId: String(me.userId || username), operator: isOperator };
  }
  return { ok: false, reason: 'forbidden' };
}

// ---- Login page (self-contained; matches the docs' Camunda-blue theme) -----
function renderLogin({ next = '/', error = '' } = {}) {
  const banner = error
    ? `<p class="err" role="alert">${escapeHtml(error)}</p>`
    : '';
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

const REASON_MESSAGE = {
  invalid: 'Incorrect username or password.',
  forbidden: 'That account is not a Lukeflow admin. Access is limited to operators.',
  unconfigured: 'Access is temporarily unavailable. Please contact the platform team.',
  upstream: 'Could not reach the identity service. Please try again shortly.',
  missing: 'Enter both a username and a password.',
};

// ---- App -------------------------------------------------------------------
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(cookieParser());

// Security response headers on every route (previously set by Render's static config).
app.use((req, res, nextFn) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (isHttps(req)) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  nextFn();
});

// Health check — always open (Render liveness probe).
app.get('/healthz', (_req, res) => res.type('text').send('ok'));

// Login page.
app.get('/login', (req, res) => {
  const next = safeNext(req.query.next);
  if (verifySession(req.cookies?.[COOKIE_NAME])) return res.redirect(next);
  res.type('html').send(renderLogin({ next }));
});

app.post('/login', express.urlencoded({ extended: false, limit: '8kb' }), async (req, res) => {
  const next = safeNext(req.body?.next);
  const username = (req.body?.username || '').trim();
  const password = req.body?.password || '';
  if (!username || !password) {
    return res.status(400).type('html').send(renderLogin({ next, error: REASON_MESSAGE.missing }));
  }
  const result = await checkAdmin(username, password);
  if (!result.ok) {
    const status = result.reason === 'invalid' || result.reason === 'forbidden' ? 401 : 503;
    return res.status(status).type('html').send(renderLogin({ next, error: REASON_MESSAGE[result.reason] }));
  }
  const exp = Math.floor(Date.now() / 1000) + TTL_HOURS * 3600;
  setSessionCookie(req, res, signSession({ u: result.userId, op: result.operator, exp }));
  res.redirect(next);
});

// Logout (GET so a plain link works; clears the cookie).
app.all('/logout', (req, res) => {
  clearSessionCookie(req, res);
  res.redirect('/login');
});

// ---- Gate: everything past here requires a valid session -------------------
app.use((req, res, nextFn) => {
  if (verifySession(req.cookies?.[COOKIE_NAME])) return nextFn();
  if (req.method === 'GET' || req.method === 'HEAD') {
    const target = safeNext(req.originalUrl);
    return res.redirect('/login?next=' + encodeURIComponent(target));
  }
  return res.status(401).type('text').send('Unauthorized');
});

// ---- Static docs (authenticated) -------------------------------------------
const serveStatic = sirv(DIST_DIR, {
  extensions: ['html'],
  etag: true,
  gzip: true,
  brotli: true,
  dev: false,
  setHeaders(res, pathname) {
    // Fingerprinted bundles are immutable; HTML pages should always revalidate.
    if (pathname.startsWith('/assets/')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
});
app.use(serveStatic);

// VitePress emits a 404.html; serve it for genuine misses (no SPA catch-all rewrite).
app.use((_req, res) => {
  const notFound = path.join(DIST_DIR, '404.html');
  if (fs.existsSync(notFound)) return res.status(404).type('html').send(fs.readFileSync(notFound, 'utf8'));
  res.status(404).type('text').send('Not found');
});

if (!fs.existsSync(DIST_DIR)) {
  console.warn(`[luke-docs] build output not found at ${DIST_DIR} — run "npm run docs:build" first.`);
}

createServer(app).listen(PORT, () => {
  console.log(`[luke-docs] serving ${DIST_DIR} on :${PORT}` +
    (CORE_ENGINE_URL ? ` (auth → ${CORE_ENGINE_URL}/api/me)` : ' (auth DISABLED — set DOCS_CORE_ENGINE_URL)'));
});
