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

The manual is **served behind a login** — only a Lukeflow **operator/admin** can read it.
Authoring is unaffected: `npm run docs:dev` runs the raw VitePress dev server with **no**
gate.

- **How it works** — the deploy no longer serves static files directly. `server/index.mjs`
  (a tiny Express app) wraps `.vitepress/dist`: an unauthenticated request is redirected to
  `/login`, the form's username + password are forwarded **server-to-server** to core-engine
  `GET /api/me`, and a signed HttpOnly session cookie is issued only when the caller is an
  operator (`operator === true`). Because the check is server-side, no CORS / `ALLOWED_ORIGINS`
  change on core-engine is needed. Same identity as core-ui — same admin credentials.
- **Run the gated build locally** — `npm run serve` (build + serve). Point it at an engine
  with `DOCS_CORE_ENGINE_URL=…` (see `.env.example`). Sign out at `/logout`.
- **Config** (Render dashboard) — `DOCS_CORE_ENGINE_URL` must be set or login is fail-closed;
  `DOCS_SESSION_SECRET` is a rendered random value (rotating it logs everyone out);
  `DOCS_ALLOW_TENANT_ADMIN=true` also admits org-admins. Full list in `.env.example`.

## Periodic re-audit (safety net)

Per-change discipline misses things. A periodic re-audit (re-run the per-repo completeness
analysis, refresh the scorecard + pills + snapshot date, open a PR) is the backstop. If a
scheduled agent or CI job is set up for this, document it here.
