# Core UI (Cockpit)

The Core UI is Lukeflow's **operator cockpit** — a Camunda-Cockpit-style operations console for the [Core Engine](/services/core-engine) (the FluxNova / Camunda-7 process engine). It is where platform operators watch and act on the running engine: process definitions and instances, human tasks, incidents, jobs, DMN decisions, deployments, history, business calendars, external-task topics, runtime health, and user/group/tenant administration.

<span class="pill partial">Partial · deployed</span>

> **Repository:** `luke-core-ui` · **Type:** Application (operator cockpit) · **Stack:** React 19 / Vite / TailAdmin

## Overview

Lukeflow has two front ends, and they serve different people:

| | Consumer UI | Core UI (this page) |
|---|---|---|
| Audience | **Tenants** — the businesses using Lukeflow | **Operators** — the team running the platform |
| Repository | `luke-consumer-ui` | `luke-core-ui` |
| Auth | WorkOS session via [Auth Engine](/services/auth-engine) | **HTTP Basic** straight to the engine |
| Mental model | Product surface (forms, email, signatures, workflows) | Engine ops console (Cockpit + Admin + Tasklist) |
| Tenancy | Scoped to the signed-in tenant | Per-tenant, deliberately isolated (see below) |

Where [Consumer UI](/apps/consumer-ui) is the polished product tenants log into, the Core UI is the low-level cockpit that operators use to observe and intervene in the engine directly. It talks to the engine's REST API without going through the WorkOS auth gateway — operators authenticate with **HTTP Basic** credentials, which are injected into every request from a single client interceptor.

::: info Tenant isolation is deliberate
The cockpit is tenant-aware and enforces isolation in the UI: there is **no cross-tenant "list all tenants" surface** for a scoped operator, and a `tenantGuard` utility keeps queries pinned to the active tenant. See [Multi-Tenancy](/concepts/tenancy) for the platform-wide model.
:::

## Architecture

The app is **feature-sliced**: `src/features/<area>/` each own their `pages/`, `components/`, `api/`, and hooks, sitting on a shared kernel in `src/shared/` (an axios `api/` client, `layout/` shell, `ui/` primitives, `bpmn/` viewer, `stores/`, `hooks/`, `utils/`). Routing lives in `src/app/App.tsx`, with lazy-loaded routes behind an `AuthGuard`; admin routes sit behind an extra `RequireOperator` gate.

**16 feature areas, ~30 pages:**

| Feature area | Pages |
|---|---|
| `dashboard` | Operator landing dashboard |
| `processes` | Definition list, definition detail, instance detail |
| `tasks` | Task list, task detail (human/Tasklist) |
| `incidents` | Incident list |
| `jobs` | Job list (job executor) |
| `history` | Historic activity / audit |
| `deployments` | Deployment list, deployment detail |
| `decisions` | DMN decision list, decision detail |
| `calendars` | Calendar dashboard, calendar detail |
| `external-tasks` | External tasks, topic registry, register topic, workflow builder |
| `runtime` | Monitor, logs, metrics, health dashboard |
| `admin` | Users, groups, tenancy dashboard (operator-gated) |
| `tenancy` | Tenancy dashboard |
| `settings` | Settings |
| `setup` | First-run setup (pre-auth) |
| `auth` | Login (pre-auth) |

**Diagram viewers.** Process definitions and instances render live BPMN via **`bpmn-js`** (wrapped in `src/shared/bpmn/`); DMN decisions render and evaluate via **`dmn-js`**. Raw payloads, variables, and configuration are edited/inspected in the **Monaco** editor, and runtime metrics are charted with **recharts**. The external-task workflow builder uses a node graph (`@xyflow/react`).

**Authentication.** A single interceptor is the only place credentials live:

```ts
// src/shared/api/client.ts
export function injectBasicAuth(config): void {
  // reads username/password from the auth store, then:
  config.headers.set('Authorization', `Basic ${btoa(`${username}:${password}`)}`);
}
```

There is no token exchange and no server session — the browser holds Basic credentials and sends them to the engine on every call. `VITE_API_BASE_URL` (baked in at build time) points the axios client at the deployed engine; left empty in local dev so requests stay same-origin and hit the Vite proxy.

## Key features

- **Process operations** — browse definitions, drill into a definition (versions, statistics) and into a single instance, with the live BPMN diagram and per-activity state.
- **Tasklist** — list and act on human tasks, including an attachments tab.
- **Incident & job triage** — inspect incidents (with stack-trace modals) and the job executor's queue.
- **Decisions** — list DMN tables and open a decision detail that renders/evaluates the table via `dmn-js`.
- **Deployments & history** — review what's deployed and query historic activity.
- **External tasks & topics** — an external-task view plus a **topic registry** (register topics) and a visual **workflow builder**.
- **Runtime observability** — a monitor plus dedicated **health**, **logs**, and **metrics** dashboards (recharts).
- **Admin** — users, groups, and a tenancy dashboard, gated behind `RequireOperator`.
- **Command palette** — a `⌘K` Topbar palette navigates to any area the operator is allowed to reach (it mirrors the sidebar's visibility rules), alongside a user-settings dropdown. Both were added recently.
- **Shared UI kit** — ~30 primitives in `src/shared/ui/` (`DataTable`, `DetailPanel`, `Drawer`, `Modal`, `StatusBadge`, `JsonViewer`, `CopyId`, `Pagination`, `ErrorBoundary`, `Skeleton`, …) keep the pages consistent.

## Technology

| Concern | Choice |
|---|---|
| Framework | React 19 + TypeScript |
| Build / dev | Vite 8 (`@vitejs/plugin-react`) |
| UI base | TailAdmin template on Tailwind CSS v4 |
| Routing | `react-router-dom` v6 (lazy routes) |
| Server state | TanStack Query (`@tanstack/react-query`) |
| Client state | Zustand |
| Validation | Zod + `react-hook-form` (`@hookform/resolvers`) |
| Tables | TanStack Table |
| HTTP | axios (single Basic-auth interceptor) |
| BPMN / DMN | `bpmn-js` 18, `dmn-js` 17 |
| Code editor | `@monaco-editor/react` |
| Charts | recharts 3 |
| Node graph | `@xyflow/react` |
| Errors / UX | `@sentry/react`, `sonner` toasts |
| Testing | Vitest + Testing Library (unit); Playwright (e2e) |
| Deploy | Render static-site blueprint (`render.yaml`) |

## Local development

```bash
npm install        # install dependencies
npm run dev        # Vite dev server (proxies /engine-rest, /api to the engine)
npm run build      # tsc -b && vite build  (what CI type-checks)
npm test           # Vitest unit tests
npm run test:e2e   # Playwright e2e (hermetic — specs stub all engine calls)
npm run lint       # ESLint (currently non-gating in CI)
```

Copy `.env.example` to `.env.local`. For local dev leave `VITE_API_BASE_URL` empty so calls stay same-origin through the Vite proxy; `VITE_CAMUNDA_BASE_URL` (default `http://localhost:8080`) sets the proxy target.

::: tip Build-time API URL
Vite inlines `VITE_*` variables at **build** time — they are not read at runtime. The deployed engine URL must be set before `npm run build`, and the engine's `ALLOWED_ORIGINS` must include this site's URL or browser calls are blocked by CORS.
:::

## Deployment

Deployed as a **static site on Render** via the `render.yaml` blueprint from the **`main`** branch: `npm ci && npm run build`, publishing `./dist` behind a CDN with an SPA rewrite so deep links (e.g. `/processes/:id`) don't 404. There is no Node server at runtime — every call goes directly to the engine. The blueprint also ships security headers (`X-Frame-Options: DENY`, `nosniff`, HSTS, referrer policy) and a **report-only CSP** staged ahead of enforcement (it still needs the engine origin in `connect-src` and validation against Monaco's blob workers before it can block).

CI runs on GitHub Actions: a `build-and-test` job (Node 22 type-check + build + unit tests), a separate hermetic Playwright **E2E** job, plus CodeQL and a Semgrep/gitleaks/Trivy security scan.

## Status & gaps

Deployed and functional, but a few things keep it at **Partial** rather than production-hardened:

- **TailAdmin re-skin is mid-polish.** The shell, shared primitives, and the detail pages are largely migrated to the TailAdmin look, but roughly **two dozen list and runtime feature files still carry inline `var(--…)` CSS styling** from the earlier design — a cosmetic-consistency debt, not a functional one.
- **Thin test coverage.** ~17 unit test files (mostly shared utils/primitives and a handful of feature APIs) and a **single login e2e spec**. The breadth of pages far outruns the tests.
- **Lint is non-gating.** The CI lint step runs `continue-on-error: true` ("informational for now"), so lint regressions don't fail a PR.
- **CSP is report-only.** Security headers are enforced, but the Content-Security-Policy is still `Content-Security-Policy-Report-Only` pending validation.

For how this app scores against the broader platform readiness checklist, see the [Completeness Scorecard](/reference/completeness).
