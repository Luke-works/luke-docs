# Consumer UI

The **Consumer UI** (`luke-consumer-ui`) is Lukeflow's primary orchestrator web
application — the single interface tenants use to build forms, manage email and
signature templates, run workflows, place phone calls, and administer access. It
is a React 19 single-page app built on the TailAdmin base, and it consumes the
Lukeflow [Headless Libraries](/libraries/forms) as vendored, pre-built dist.

<span class="pill partial">Partial · deployed (dev/qa)</span>

> **Repository:** `luke-consumer-ui` · **Type:** Application · **Stack:** React 19 / Vite 6 / TypeScript / Tailwind v4

::: tip Looking for the click-paths?
For the end-to-end **user journeys** through this app — sign-in, building & publishing a form,
embedding it, sending for signature, requesting access, etc., each with a diagram — see
**[Consumer UI — User Action Flows](/apps/consumer-ui-flows)**.
:::

## Overview

Lukeflow describes itself as "an orchestrator for a better future." The Consumer
UI is the tenant-facing surface of that orchestrator: a Vite-bundled SPA where an
authenticated user, scoped to a tenant, works across the platform's
[capabilities](/concepts/capabilities). The shell is derived from
[TailAdmin](https://tailadmin.com) (MIT), themed for Lukeflow, and organized into
roughly a dozen product sections spanning ~55 page-level `.tsx` files (47 in the
authenticated app, plus auth/onboarding/public views).

Rather than embedding source for the form, email, signature, and workflow
engines, the app **vendors their built dist** — the engines are developed and
tested in their own monorepos (e.g. `luke-forms`) and copied in here as pinned
artifacts. That keeps the app thin and the engines independently versioned and
testable.

::: info Where the source lives
This app is a *consumer* of the headless engines. Feature and bugfix work on a
form/email/sign/workflow package happens in that package's monorepo; this repo
only re-vendors the built dist and themes it. See [Forms library](/libraries/forms).
:::

## Architecture

The app follows a conventional layered structure under `src/`:

| Layer | Path | Responsibility |
| --- | --- | --- |
| Routes | `App.tsx` | React Router v7 route table; auth/capability guards |
| Shell | `layout/` | `AppLayout`, `AppSidebar`, `AppHeader`, tenant switcher |
| Pages | `pages/` | Per-section screens (~55 files across ~12 sections) |
| Components | `components/` | Shared UI, tables, charts, header widgets |
| Context | `context/` | `AuthContext`, `ThemeContext`, `SidebarContext` |
| Hooks | `hooks/` | `useDialog`, `useMediaQuery`, `useMutationLock` |
| API / lib | `lib/` | Typed gateway clients, stores, schema + guards |

### The vendored-dist model

The `@lukeflow/*` packages are declared in `package.json` as `file:` dependencies
pointing at `vendor/@lukeflow/<pkg>/`, and reinforced with npm `overrides` so the
vendored copy always wins. The currently vendored packages are:

| Package group | Packages |
| --- | --- |
| Forms | `form-core`, `form-react`, `form-builder`, `form-embed` |
| Email | `email-core`, `email-react`, `email-builder` |
| Signatures | `sign-core`, `sign-react` |
| Workflow | `workflow-core`, `workflow-builder` |

The ship flow is: build the package in its monorepo, copy `index.{js,cjs,d.ts,d.cts}`
+ `styles.css` into `vendor/@lukeflow/<pkg>/dist`, then `npm run build` here.
Because `tsc -b` runs first, a passing build confirms the vendored public types
still resolve against the app.

### App sections & capabilities

Product areas are gated by tenant [subscription level](/concepts/capabilities).
Routes for a capability are wrapped in a `CapabilityRoute` guard, and the
`WORKFLOW` capability is hidden by default (see status below).

| Section | Capability | Representative routes |
| --- | --- | --- |
| Dashboard | — | `/dashboard` |
| Forms | `FORMS` | `/forms`, `/forms/:id`, `/forms/inbox`, `/forms/instances`, `/forms/:code/fill`, `/forms/:code/responses` |
| Email | `EMAIL` | `/email` |
| Email Templates | `EMAIL` | `/email-templates`, `/email-templates/:id` |
| Signatures | `SIGNATURES` | `/signatures`, `/signatures/:id` |
| Phone | `PHONE` | `/phone`, `/phone/:id` |
| Workflow | `WORKFLOW` | `/workflow`, `/workflow/connections`, `/workflow/:id` |
| Access | — | `/access` |
| Account | — | `/account/profile`, `/account/settings` |
| Support | — | `/support` |
| Auth | — | `/signin`, `/signup`, `/sso-callback` |

### Public token routes

Three routes render outside the authenticated shell, keyed by an opaque token,
for recipients who are not logged-in tenant users:

- `/embed/:token` — embedded inbound form intake
- `/respond/:token` — outbound form response
- `/sign/:token` — signature request signing

These correspond to dedicated Vite build targets (`embed`, `respond`, `render`)
alongside the main SPA build.

::: tip Authentication
Sessions and tenant scoping flow through `AuthContext` (backed by `lib/authApi`),
part of the platform's headless WorkOS-based auth. See
[Authentication & Authorization](/concepts/auth).
:::

## Key features

- **Form designer & runtime** — visual builder (`FormBuilderPage`), preview, fill,
  inbox, instances, responses, embed and send panels, plus an AI assist panel.
- **Email** — template list + visual/AI builder (`EmailTemplateBuilderPage`) and an
  email section, built on react-email components.
- **Signatures** — signature template builder, list, and the public signing page.
- **Phone** — call list and detail views for the Vapi-backed voice capability.
- **Workflow** — JSON→BPMN builder, runs modal, and Nango-backed connections
  (hidden behind a flag).
- **Access management** — capability grants, access requests, members, invitations.
- **Tenant switching** — multi-tenant session switching in the sidebar.
- **AI assist panels** — per-capability assistants (forms, email, workflow) calling
  the `luke-agents` fleet.
- **Observability** — Sentry (`@sentry/react`) wiring via `lib/observability`.
- **Autofill suppression** — inputs suppress browser/password-manager autofill by
  default (`lib/autofill`).

## Technology

| Concern | Choice |
| --- | --- |
| Framework | React 19 (`react`, `react-dom` ^19.2) |
| Routing | React Router 7 (`react-router` ^7.18) |
| Build | Vite 6 (multiple config targets: main, embed, respond, render) |
| Language | TypeScript ~5.7 (`tsc -b` project references) |
| Styling | Tailwind CSS v4 (`@tailwindcss/postcss`), TailAdmin base |
| Tables / graph | `@tanstack/react-table`, `@xyflow/react` |
| PDF | `pdfjs-dist`, `react-pdf` (signature rendering) |
| Email | `@react-email/components`, `@react-email/render` |
| Integrations | `@nangohq/frontend` (workflow connections) |
| Validation | `zod` v4; `dompurify` for sanitization |
| Errors | `@sentry/react` |
| Testing | Vitest 4 (unit) + Playwright (e2e) |

## Local development

```bash
npm install
npm run dev        # Vite dev server on http://localhost:5173
npm run build      # tsc -b + vite build + embed/respond/render targets
npm run preview    # preview the production build
npm run lint       # eslint . --max-warnings 0  (zero-tolerance)
npm test           # vitest run — unit suite
npm run test:e2e   # playwright test — end-to-end specs
```

Re-vendoring a headless package's bundle (from its monorepo build):

```bash
npm run vendor:respond   # build:respond + copy bundle into vendor/
npm run vendor:embed     # build:embed  + copy bundle into vendor/
```

The test suite comprises ~128 unit cases across 18 Vitest files and four
Playwright specs (`screens`, `flows`, `smoke`, `forms-builder-overflow`). The
`screens` spec is a render matrix that visits **31 routes across 4 viewports**
(phone 390px, tablet 768px, laptop 1280px, desktop 1536px), asserting each screen
renders without crashing or horizontal overflow.

::: warning CI is gating
CI (`ci.yml`) runs on Node 22: type-check + build, then unit tests, then
`eslint . --max-warnings 0`. Any error *or* warning fails the build. CodeQL and a
security scan also run; the e2e suite runs hermetically (Vite dev server + stubbed
gateway calls) in a separate workflow.
:::

## Deployment

The app deploys to **Render**, with deploy configuration owned by the
`luke-platform` repository (this repo carries no `render.yaml`). Lukeflow services
deploy from the `develop` and `qa` branches — not `main` — so changes must target
`develop` to ship.

The single `npm run build` produces the main SPA plus three additional bundles
(`dist-embed`, `dist-respond`, `dist-render`) for the public `/embed`, `/respond`,
and PDF-render targets. Note that the standalone `/embed` bundle is also copied
into the core engine's static assets, so an embed change only reaches production
once that copy is rebuilt and shipped there too.

## Status & gaps

The app is deployed on dev/qa and broadly functional, but a few capabilities are
still partial:

- **Send-side runtime** — some outbound send paths (e.g. outbound-form send,
  email send-to-Camunda) are staged in the UI but not fully wired end-to-end.
- **Workflow hidden** — the `WORKFLOW` capability is hidden from nav, routes, and
  access lists behind `VITE_WORKFLOW_ENABLED` (default off) until launch.

For an at-a-glance view of what is complete versus pending across the platform,
see the [Completeness Scorecard](/reference/completeness).
