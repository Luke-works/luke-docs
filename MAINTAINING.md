# Maintaining this manual

This site is **hand-written prose**, one page per repository plus fleet-level concept
pages. There is no automatic code→docs generator, so it stays accurate only if it is
**updated in the same unit of work as the change it documents**.

## The rule

> When you materially change a `luke-*` repo, update its page here **in the same PR /
> session**. A change is "material" if a reader of the page would now be **misled**: a new
> or removed capability / endpoint / package / service, a change to architecture, auth,
> deployment or the tech stack, a status move (in-progress ↔ ready), or a notable test/CI
> addition. Typos, pure refactors, and dependency bumps do **not** need a docs edit.

## Repo → page map

| Repo | Page |
| --- | --- |
| `luke-core-engine` | `services/core-engine.md` |
| `luke-auth-engine` | `services/auth-engine.md` |
| `luke-file-proxy` | `services/file-proxy.md` |
| `luke-agents` | `services/agents.md` |
| `luke-consumer-ui` | `apps/consumer-ui.md` |
| `luke-core-ui` | `apps/core-ui.md` |
| `luke-marketing-ui` | `apps/marketing-ui.md` |
| `luke-forms` | `libraries/forms.md` |
| `luke-email` | `libraries/email.md` |
| `luke-signatures` | `libraries/signatures.md` |
| `luke-lists` | `libraries/lists.md` |
| `luke-analytics` | `libraries/analytics.md` |
| `luke-workflow` | `libraries/workflow.md` |
| `luke-platform` | `operations/platform.md` |
| `luke-api-collection` | `operations/api-collection.md` |
| *(cross-cutting)* | `guide/*`, `concepts/*`, `operations/{testing,security}.md` |

## Checklist for a change

1. **Edit the repo's page** — update the changed facts and its **Status & gaps** section.
2. **If status/completeness changed**, update:
   - `reference/completeness.md` — the scored row.
   - `guide/fleet-map.md` — the status pill.
3. **On a broad refresh**, bump the snapshot date: the `SNAPSHOT` const in
   `.vitepress/config.ts` (surfaced in the nav + footer).
4. **Build must stay green**: `npm run docs:build`.
5. **Commit + push `main`** — Render redeploys automatically.

## Status pills

Use these inline in Markdown (defined in `.vitepress/theme/custom.css`):

```html
<span class="pill ready">Production-ready</span>
<span class="pill partial">Partial</span>
<span class="pill lib">Library (vendored)</span>
<span class="pill exp">Experimental / pre-launch</span>
```

## Access control (the login gate)

The Render deploy stays a plain **static site** — but the public hostname
`docs.lukeflow.com` is fronted by a **Cloudflare Worker** that gates it, so only a Lukeflow
**operator/admin** can read the manual. Authoring is unaffected: `npm run docs:dev` runs the
raw VitePress dev server with **no** gate.

- **How it works** — the Worker (`edge/worker.js`, on route `docs.lukeflow.com/*`) redirects an
  unauthenticated request to `/login`, forwards the form's username + password **edge-to-service**
  to core-engine `GET /api/me`, and issues a signed HttpOnly session cookie only when the caller
  is an operator (`operator === true`). Authenticated requests pass straight through to the static
  origin. Because the check is edge-side, no CORS / `ALLOWED_ORIGINS` change on core-engine is
  needed. Same identity as core-ui — same admin credentials.
- **Deploy / config** — see `edge/README.md`. Two Cloudflare secrets: `DOCS_CORE_ENGINE_URL`
  (login is fail-closed until set) and `DOCS_SESSION_SECRET` (rotating it logs everyone out);
  `DOCS_ALLOW_TENANT_ADMIN=true` (a `wrangler.toml` var) also admits org-admins.
- **Roll back** — `npx wrangler delete` removes the Worker + route; the site reverts to the open
  static origin instantly.

## Periodic re-audit (safety net)

Per-change discipline misses things. A periodic re-audit (re-run the per-repo completeness
analysis, refresh the scorecard + pills + snapshot date, open a PR) is the backstop. If a
scheduled agent or CI job is set up for this, document it here.
