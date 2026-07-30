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
| Analytics | `analytics-core`, `analytics-react` |

The ship flow for the **Forms** packages is scripted: `npm run vendor:forms` builds
nothing itself but copies the whole `dist/` of each package out of a sibling
`luke-forms` checkout (override with `LUKE_FORMS_DIR`), derives each vendored
`package.json` from source, refreshes `public/embed.js` from the embed SDK's IIFE
build, and writes `vendor/@lukeflow/.vendor-manifest.json` with a per-file SHA-256.
`npm run vendor:check` re-verifies that manifest and **gates CI**.

::: tip Why the whole dist, not a file list
Vendoring used to copy a hand-picked list of files with a hand-maintained
`package.json`, and it lost things silently — twice. It dropped `form-core`'s
`./quickjs` subpath, so the isolated-JS evaluator was built and tested upstream but
never arrived (nothing failed; the capability was just absent). And it left
`form-react` a commit stale, so an upstream stored-XSS fix sat unvendored for days.
Neither is the kind of mistake more care prevents — a copy step with no verifier
can't tell you what it failed to copy. Copying the whole `dist`, deriving `exports`
from source, and asserting every advertised subpath exists means an entry point
can't be lost in transit; the manifest check catches hand-edits and partial copies.
:::

The other package groups still use the manual copy (`index.{js,cjs,d.ts,d.cts}` +
`styles.css`). Either way, `npm run build` runs `tsc -b` first, so a passing build
confirms the vendored public types still resolve against the app.

::: warning Renderer adapters must parse the schema once
`@lukeflow/form-react`'s engine rebuilds whenever the schema **object identity** changes, and it
reads `initialValues` only at build time. So an adapter that calls `JSON.parse` inline in its render
body hands the engine a new object on every render — and any re-render of the *host* silently wipes
the filler's in-progress answers while the inputs keep displaying them, so submitting then fails
with "field is required". It bit the public embed hardest (finishing an attachment upload, or
switching to the Attachments tab, re-renders the host) and the same pattern existed in
[the recipient portal](/apps/portal). Both adapters now `useMemo` the parse on the schema **string**
— exact, since strings compare by value, and a real schema edit still rebuilds for the builder's
live preview. To show a different record under the same schema, remount with a `key`; changing
`initialValues` on a mounted renderer does nothing.
:::

### App sections & capabilities

Product areas are gated by tenant [subscription level](/concepts/capabilities).
Routes for a capability are wrapped in a `CapabilityRoute` guard. The MVP surface is
**Forms + Email + Access**; the `PHONE`, `SIGNATURES` and `WORKFLOW` capabilities are
**hidden by default** (post-MVP — see status below).

| Section | Capability | Representative routes |
| --- | --- | --- |
| Dashboard | — | `/dashboard` |
| Forms | `FORMS` | `/forms`, `/forms/:id`, `/forms/inbox`, `/forms/instances`, `/forms/:code/fill`, `/forms/:code/responses` |
| Email | `EMAIL` | `/email` |
| Email Templates | `EMAIL` | `/email-templates`, `/email-templates/:id` |
| Signatures | `SIGNATURES` | `/signatures`, `/signatures/:id` |
| Phone | `PHONE` | `/phone`, `/phone/:id` |
| Workflow | `WORKFLOW` | `/workflow`, `/workflow/connections`, `/workflow/:id` |
| Analytics | `FORMS` + flag | `/analytics` (hidden unless `VITE_ANALYTICS_ENABLED`) |
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

The access token lives in memory and is renewed lazily: `authed()` refreshes once on a 401 and
retries. `refresh()` is **single-flight** — WorkOS rotates the refresh token, so simultaneous
refreshes (pages that load two resources in parallel, e.g. the forms list's live + trashed
queries) would spend the cookie twice and the loser's 401 would clear it, signing the user out
mid-load.
:::

## Key features

- **Form designer & runtime** — visual builder (`FormBuilderPage`), preview, fill,
  inbox, instances, responses, embed and send panels, plus an AI assist panel.
  Form settings open from a **gear icon** beside the form name into a tabbed dialog
  (`FormSettingsModal`: General · Submission · Legal · Appearance · Activity) — see
  [Forms](/capabilities/forms#form-settings-dialog). **Legal** configures the consent
  statement fillers must accept ([consent record](/capabilities/forms#consent-record-the-legally-binding-part));
  **Appearance** carries the font and the **"Developed at Lukeflow"** option (with a live
  preview of the badge): locked on for free tenants, switchable for paying ones. The badge
  (`components/common/LukeflowBadge.tsx`) and the consent gate
  (`components/formBuilder/FormConsentGate.tsx`) both render on the public embed and respond bundles.
- **Email** — template list + visual/AI builder (`EmailTemplateBuilderPage`) and an
  email section, built on react-email components. Once a domain is verified, the Email
  page also registers **email boxes** — inbound (receive, workflow-triggering) or
  outbound (send, dedicated Postmark stream) addresses on the sender domain.
- **Signatures** — signature template builder, list, and the public signing page
  (post-MVP; hidden behind a flag).
- **Phone** — call list and detail views for the Vapi-backed voice capability
  (post-MVP; hidden behind a flag).
- **Workflow** — JSON→BPMN builder, runs modal, and Nango-backed connections
  (post-MVP; hidden behind a flag).
- **Access management** (`/access`) — a grouped console over the three access
  dimensions plus the people surfaces:
  - **You** — *Manage My Access*: what you hold, requesting more, your request history, and
    **Sent back to you** — requests a resource owner returned, with the reason and the two actions
    the approval process is waiting on (revise & resubmit, or withdraw).
  - **Requests** — the approval queue for resource owners and org owners. "Deny" is presented as
    **Send back**, because that is what it now does: the request returns to the requester rather
    than ending. See the core-engine access-request approval workflow.
  - **Access model** — *Roles* (core-engine `RoleCatalog`, explained + a member×role
    matrix), *Attributes* (identity-provider profile fields, read-only) and
    *Capabilities* (per-capability grant levels, one capability at a time, plus **who approves
    requests for it** — the resource-owner group the approval task routes to; empty means the
    org owners).
  - **Organization** — members, candidate groups, invitations.
- **LukeExplains** — plain-language access explanations shown wherever access is
  chosen or decided (request form, approval queue, grant editors). `lib/lukeExplains`
  derives them from the real backend contract — level semantics from
  `CapabilityLevel`, and the blocked-action lists from the routes actually annotated
  `@RequiresCapabilityAction(PUBLISH|DELETE)` — so requester and approver see the same
  truthful statement of what a grant allows, what it still blocks, and what deserves a
  second look.
- **Capability levels** — `read | contributor | read-write`, mirroring core-engine
  `CapabilityLevel` (#104). Contributor is grantable from the Capabilities section and
  enforced by the API; the feature screens still gate edit controls on `canWrite`
  (read-write only), so a contributor currently sees a read-only product UI — the
  screens must move publish/purge controls onto `canPublish`/`canDelete` first.
- **Access provenance (forward-compatible)** — `AccessProvenance` on members and
  grants renders a source badge and locks the control when access is owned by an
  external identity system. The backend does not stamp a source yet, so nothing is
  labelled today; the UI lights up when it starts arriving.
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
npm run vendor:forms     # copy form-* dist + public/embed.js from ../luke-forms, write the manifest
npm run vendor:check     # verify vendor/@lukeflow matches its manifest (this is what CI runs)
npm run vendor:respond   # build:respond + copy bundle into vendor/
npm run vendor:embed     # build:embed  + copy bundle into vendor/
```

The test suite comprises ~128 unit cases across 18 Vitest files and four
Playwright specs (`screens`, `flows`, `smoke`, `forms-builder-overflow`). The
`screens` spec is a render matrix that visits **31 routes across 4 viewports**
(phone 390px, tablet 768px, laptop 1280px, desktop 1536px), asserting each screen
renders without crashing or horizontal overflow.

::: warning CI is gating
CI (`ci.yml`) runs on Node 22: `vendor:check`, then type-check + build, then unit
tests, then `eslint . --max-warnings 0`. Any error *or* warning fails the build.
CodeQL and a security scan also run; the e2e suite runs hermetically (Vite dev
server + stubbed gateway calls) in a separate workflow.
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
- **Post-MVP capabilities hidden** — the MVP UI is Forms + Email + Access only.
  `PHONE`, `SIGNATURES` and `WORKFLOW` are hidden from nav, routes, and the
  access/request/catalog lists, each behind its own flag (`VITE_PHONE_ENABLED` /
  `VITE_SIGNATURES_ENABLED` / `VITE_WORKFLOW_ENABLED`, all default off) until launch.
  The pages still exist and stay fully covered by the E2E suite (which enables all
  three). Documents has no UI capability, so nothing is gated there.

For an at-a-glance view of what is complete versus pending across the platform,
see the [Completeness Scorecard](/reference/completeness).
