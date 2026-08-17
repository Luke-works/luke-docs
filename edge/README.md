# Docs access gate (Cloudflare Worker)

The manual is a **public static build** on Render, but the world reaches it through
Cloudflare at `docs.lukeflow.com`. This Worker sits on that hostname and gates it:
only a Lukeflow **operator/admin** can read the docs.

## How it works

1. An unauthenticated request is redirected to `/login` (a self-contained page the
   Worker renders — no origin call).
2. The submitted **username + password** are forwarded edge-to-service to core-engine
   `GET /api/me` — the same identity core-ui uses.
3. If the caller is an operator (`operator === true`), the Worker sets a signed,
   HttpOnly session cookie (HMAC-SHA256, 12h) and redirects back.
4. Authenticated requests **pass straight through** to the Render static origin.

Because the credential check is edge-to-service, **no CORS / `ALLOWED_ORIGINS` change
on core-engine is needed**. The Render service stays a plain static site — nothing on
that side changes. Local authoring (`npm run docs:dev`) is unaffected.

## One-time deploy

From this directory (`luke-docs/edge/`):

```bash
# 1. Log in to the Cloudflare account that owns the lukeflow.com zone
npx wrangler@latest login

# 2. Set the two secrets (prompts for the value; nothing is written to git)
npx wrangler@latest secret put DOCS_SESSION_SECRET     # any long random string
npx wrangler@latest secret put DOCS_CORE_ENGINE_URL    # https://<core-engine host> (no trailing slash)

# 3. Deploy — this also creates the docs.lukeflow.com/* route from wrangler.toml
npx wrangler@latest deploy
```

Generate a strong secret with: `openssl rand -hex 32`.

## Config

| Name | Where | Purpose |
| --- | --- | --- |
| `DOCS_SESSION_SECRET` | secret | Signs session cookies. Rotating it logs everyone out. **Required.** |
| `DOCS_CORE_ENGINE_URL` | secret | core-engine base URL, no trailing slash. **Required** — login is fail-closed until set. |
| `DOCS_ALLOW_TENANT_ADMIN` | var (wrangler.toml) | `true` also admits org-admins (`tenant-admin` role). Default operators-only. |
| `DOCS_ORIGIN` | var (optional) | Explicit origin base to proxy to. Unset = same-zone pass-through. |
| `DOCS_SESSION_TTL_HOURS` | var (optional) | Session lifetime, default 12. |

## Verify after deploy

- `https://docs.lukeflow.com/` → redirects to the **Sign in** page.
- Sign in with operator credentials → docs load; a non-operator gets "not a Lukeflow admin".
- `https://docs.lukeflow.com/logout` clears the session.
- `https://docs.lukeflow.com/healthz` → `ok` (open; for uptime checks).

If the old page is cached, purge the Cloudflare cache for the zone once after the first deploy.

## Roll back

`npx wrangler@latest delete` removes the Worker and its route — the site instantly
reverts to the open static origin.
