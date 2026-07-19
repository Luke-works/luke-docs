# Signatures

The **Signatures** library (`luke-signatures`) is Lukeflow's headless
e-signature **frontend contract + UI** — a TypeScript monorepo that mirrors
[`luke-forms`](/libraries/forms) 1:1. It supplies the design-time signature
schema, the runtime signing model, the geometry/transport plumbing, and the
React components (PDF viewer, signature pad, builder, signing ceremony) — but it
does **not** perform cryptographic signing. Real PAdES signing lives engine-side.

<span class="pill lib">Library (vendored) · headless</span>

> **Repository:** `luke-signatures` · **Type:** Headless library (monorepo) · **Packages:** sign-core / sign-react

## Overview (frontend contract + UI; PAdES signing is engine-side)

`luke-signatures` is the client half of the [Signatures
capability](/concepts/capabilities). It defines the *shape* of a signable
document — signer roles, field placement, routing, lifecycle — and renders the
designer and the guided signing flow. It is deliberately decoupled from any
app's routing and auth so it can be vendored into a host and reused.

::: warning Cryptographic signing does not happen here
The actual **PAdES** cryptographic signing — native e-sign on **Apache PDFBox +
BouncyCastle** — lives in a separate engine-side component, tracked with the
[Core Engine](/services/core-engine) merge (the standalone `luke-signature-engine`
to be folded into core). This repository is the **frontend contract and UI
only**: types, geometry, transport-agnostic clients, and React components. It
stamps *intent* onto a PDF; the engine flips coordinates, embeds the signature,
and produces the sealed document.
:::

Like the other headless engines, it is developed and tested in its own monorepo
and consumed by [Consumer UI](/apps/consumer-ui) as pre-built vendored `dist`.
The Signatures pages, capability gating, and routing stay in the host app.

## Architecture

The library follows the **two-phase model** — design time and runtime — that
mirrors Forms (FormDefinition → FormVersion → FormInstance):

```
PHASE 1 — design time                        PHASE 2 — runtime
────────────────────────────────────         ─────────────────────────────
SignatureDefinition  (editable draft)         SignatureInstance
   │  checkout (advisory lock)                   pins definitionCode + version
   │  edit the SignatureSchema                   one per signing event
   │  check-in → SignatureVersion (snapshot)     mapped to a Camunda process
   │  LEGAL SIGN-OFF (signedOffAt)  ◄─ review        = THE CEREMONY
   │  publish (gated on sign-off)              per-recipient signing links
   ▼                                           (public SigningCeremony UI)
 publishedVersion ──────────────────────────► created from a published version
```

- A **`SignatureDefinition`** has a stable `code` (e.g. `SD-XKQW-27JUN26`), an
  editable `schema` draft, a `status` (`draft | published | archived`), an
  advisory edit lock, and a chain of immutable **`SignatureVersion`**s. Each
  version carries `signedOffAt` — **sign-off is the legal review gate**, and
  `publish` is blocked until a version is signed off (exactly like forms).
- A **`SignatureInstance`** pins `definitionCode + version` so the document
  never shifts under an in-flight ceremony. It carries
  `context.{processInstanceId, taskId, businessKey, correlation.messageName}` so
  submitting the final signature completes/correlates the bound **Camunda** task.

### Packages

| Package | React? | Responsibility |
| --- | --- | --- |
| **`@lukeflow/sign-core`** | No (zero React) | Headless contract. **Design-time:** `SignatureSchema` (signers + field palette + routing + opaque `documentKey`) with `validate` / `repair` / `parse` / `default`, `lifecycleGate`, and `createSignatureDefinitionsClient` (CRUD + checkout/check-in/**sign-off**/publish + document upload). **Runtime:** `SignatureInstance` + state machine + Camunda context, `createSignatureInstancesClient`, the per-recipient `createSignaturesClient` + public signing session, and **geometry** (`placeField` / `fieldToCssRect`). Auth injected via options. |
| **`@lukeflow/sign-react`** | Yes (peer `react`, `react-pdf`) | UI. **`SignatureBuilder`** (Phase-1 designer: signer roster, field palette, click-to-place + drag/select/delete on a multi-page PDF, routing, live Problems; uncontrolled + `ref`, like `FormBuilder`), **`SigningCeremony`** (Phase-2 guided review → adopt → confirm), plus `DocumentViewer`, `AdoptSignature`, `SignaturePad`, `PdfView`, and theme helpers. Depends on `sign-core`. |

### sign-core module surface

| Module | Provides |
| --- | --- |
| `schema.ts` | `SignatureSchema` + field/signer/routing types, `validate/repair/parse/default`, `nextId`, `SIGNER_COLORS`, `FIELD_TYPES` |
| `lifecycle.ts` | `SignatureDefinitionStatus`, `LifecycleState`, `lifecycleGate(state)` — single source of truth for builder top-bar buttons and automation |
| `definitions.ts` | `createSignatureDefinitionsClient` — list/get/create/patchMeta, saveDraft, checkIn, versions, `signOff`, `publish`, checkout/release/discard, retire/restore/purge, audit, upload/fetch document |
| `instance.ts` | `SignatureInstance` + state machine + `CamundaContext`; `createSignatureInstancesClient` (create/list/get/cancel/remind) |
| `client.ts` | Per-recipient runtime `createSignaturesClient` + public signing session |
| `http.ts` | Shared authed transport (Bearer + `X-Tenant-Id`, refresh-on-401) |

## Key features

- **Two-phase, sign-off-gated lifecycle.** A definition is an editable draft;
  check-in snapshots an immutable version; a version must pass **legal sign-off**
  before it can be published — `publish` is blocked otherwise. `lifecycleGate`
  is the one place that decides which actions are legal in a given state.
- **`SignatureSchema` with validate / repair / parse.**
  `validateSignatureSchema` returns errors (which gate sign-off/publish) plus
  warnings; `repairSignatureSchema` / `parseSignatureSchema` make a malformed
  stored draft safe to load — mirroring `repairFormSchema`. Field types are
  `SIGNATURE | INITIALS | DATE | NAME | TEXT`.
- **PDF-point, top-left geometry that refuses rotated pages.** Field
  coordinates are stored as **PDF points with a top-left origin** (the engine
  flips Y). Geometry helpers place fields and convert to CSS rects; a rotated
  page (`isRotated(geometry)`) is **refused** — signing it would misplace the
  stamp.
- **Transport-agnostic clients with an injected-auth seam.** Clients take
  `baseUrl`, `getToken`, and `refresh` as options — no coupling to any app's
  auth module. Authed calls send `Authorization` + `X-Tenant-Id`; the public
  signing session sends neither. The client **never** sends `X-User-Id` (the
  gateway forbids it).
- **Camunda-orchestrated ceremony.** A runtime instance is bound to a process
  task via its `context`; the final signature completes/correlates that task —
  the same `formKey` orchestration pattern used by Forms.

::: tip The injected-auth seam
```ts
import { createSignaturesClient } from "@lukeflow/sign-core";

const client = createSignaturesClient({
  baseUrl: import.meta.env.VITE_SIGNATURES_API_URL, // engine or gateway
  getToken: () => getAccessToken(),                  // host supplies the bearer
  refresh: () => refresh(),                          // host supplies 401-refresh
});

await client.listSignatures(tenant);
await client.getSigningSession(token);               // public path — no auth headers
```
:::

## Technology

| Concern | Choice |
| --- | --- |
| Language | TypeScript (`^5.6`) |
| Repo layout | npm workspaces monorepo (`packages/*`) |
| Bundler | `tsup` — dual ESM/CJS + `.d.ts` |
| Tests | Vitest (`^2.1`) |
| PDF rendering | `react-pdf` (`^10.4`) + `pdfjs-dist` (`^5.4`), version-pinned to match |
| React | peer `react >= 18` (dev on React 19) |
| Release wiring | Changesets (`changeset publish`) |
| License / access | `UNLICENSED` · `"access": "restricted"` |
| Node | `>= 18` |

::: info pdf.js worker
`@lukeflow/sign-react` ships `pdfWorker` wiring via
`new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url)`; the host
bundler (Vite) resolves it. `pdfjs-dist` is pinned to `react-pdf`'s version so
the API and worker stay in lockstep.
:::

## Local development

```bash
npm install
npm run build      # sign-core → sign-react (tsup: dual ESM/CJS + d.ts)
npm test           # vitest across workspaces
npm run typecheck  # tsc --noEmit per package
```

The root `build` script builds `sign-core` first, then `sign-react` (which
depends on it). `npm run release` runs a build followed by `changeset publish`.

## Consumption

`luke-consumer-ui` consumes both packages as **vendored built dist** under
`vendor/@lukeflow/sign-{core,react}/`, wired as `file:` dependencies (and npm
`overrides`) exactly like Forms. The workflow:

1. **Build here**, copy `dist` into the host's `vendor/` tree.
2. Construct the clients with the app's `getAccessToken` / `refresh`.
3. Mount `<SignatureBuilder>` on a builder page (mirroring `FormBuilderPage`);
   debounce `saveDraft` on `onChange`; wire the top bar via `lifecycleGate(...)`
   + client `checkout/checkIn/signOff/publish`. The **top-bar lifecycle UI stays
   in the host**.
4. Render `<SigningCeremony>` on the public per-recipient route.

The list page, public sign page, capability gating, and routing are all **host
app glue** — they live in [Consumer UI](/apps/consumer-ui), not in the library.

::: warning Authed document rendering gotcha
A stored document URL is **authed** (needs `X-Tenant-Id` + Bearer), but pdf.js
fetches without them. For an existing definition, call
`definitionsClient.fetchDocument(tenant, id, key)` → `URL.createObjectURL(blob)`
and pass **that** (or the original `File`) as `documentSource`. Do **not** pass
the raw `documentUrl`.
:::

## Status & gaps

The library is **alpha** (`0.1.0-alpha.0`) and vendored per the model above.

| Area | State |
| --- | --- |
| `sign-core` logic | Covered — ~42 tests total (schema, lifecycle, geometry, adapters, client, plus a `sign-react` theme util) |
| `sign-react` components | **Untested** — the ~2,000 LOC of React (`SignatureBuilder`, `SigningCeremony`, `DocumentViewer`, `AdoptSignature`, `SignaturePad`, `PdfView`) have no component tests |
| CI | **None** — no `.github/workflows`, despite Changesets/release wiring being present |
| PAdES signing | **Out of scope here** — implemented engine-side (PDFBox + BouncyCastle); this repo is the contract + UI only |
| Engine endpoints | The `/api/signature-definitions` and `/api/signatures` surfaces the clients call are **expected**, to be implemented in the engine/core |

::: danger Key gaps
- **No CI pipeline** guards this repo — tests and build run only locally.
- The **React components are untested**; only `sign-core` (and one theme helper)
  have coverage.
- **Cryptographic signing is external.** This library cannot produce a sealed,
  legally-binding PDF on its own; it hands intent to the signing engine.
:::

For where this sits against the rest of the platform, see the
[Completeness Scorecard](/reference/completeness). Related:
[Signatures capability](/concepts/capabilities) ·
[Core Engine](/services/core-engine) · [Consumer UI](/apps/consumer-ui).
