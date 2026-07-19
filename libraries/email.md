# Email

Lukeflow's headless **email-template management** engine — a framework-agnostic `EmailDoc` model, a React renderer that compiles it to Postmark-ready HTML + text, and a WYSIWYG builder. It mirrors the structure of [Forms](/libraries/forms) and is vendored into the [Consumer UI](/apps/consumer-ui). <span class="pill lib">Library (vendored) · headless</span>

> **Repository:** `luke-email` · **Type:** Headless library (monorepo) · **Packages:** email-core / email-react / email-builder

## Overview (template management only)

`luke-email` owns exactly one thing: the **template**. An AI agent (see [Agents (AI)](/services/agents)) or the visual builder produces an `EmailDoc`; the renderer compiles it to inlined HTML + a text alternative plus a declared `variables[]` contract; the builder UI edits it. That is the whole surface.

::: warning Sending and receiving are out of scope — by design
These packages **never send or receive mail.** Email outbound and inbound are **Camunda tasks in the [Core Engine](/services/core-engine)**:

- the **outbound** task reads the compiled artifact's `variables[]` JSON to validate the process `TemplateModel`, then pushes HTML + template alias to Postmark and sends;
- the **inbound** task ingests replies (e.g. a Postmark inbound webhook) and correlates them back to a process instance.

`{{vars}}` stay **literal** in the published HTML/text — Postmark (Mustachio) performs the merge at send time. This library only produces the artifact the engine consumes.
:::

This split keeps the [Email capability](/concepts/capabilities) cleanly layered: a pure, testable, zero-network template model here, and all delivery/orchestration in the engine where the transaction boundary and outbox live.

## Architecture

The repo is a TypeScript **npm-workspaces monorepo** (`packages/*`) with three published packages built in dependency order (tsup, dual ESM/CJS + `.d.ts`).

| Package | Depends on | What it provides |
|---|---|---|
| **`@lukeflow/email-core`** | *(nothing — zero runtime deps)* | The headless model: the `EmailDoc` block vocabulary, `validateEmailDoc`/`repairEmailDoc` (tolerant, never throw), `extractVariables`/`parseEmailDoc`, the typed variable contract, the shared `FONTS` library, and the color/bounds/URL safety layer. |
| **`@lukeflow/email-react`** | `email-core`, react-email | The React renderer: `EmailRenderer` (live sandboxed iframe preview) and `compileEmail(doc)` → `{ subject, html, text, variables }` with Tailwind styles inlined. |
| **`@lukeflow/email-builder`** | `email-core` (react peer) | The visual builder: `EmailBuilder` (palette · WYSIWYG canvas · settings · preview-with-sample-data · problems) plus the headless `useEmailBuilder` controller. Decoupled from `email-react` via a host `renderPreview(doc, values)` slot. |

### The `EmailDoc` model

A bounded document — a `subject`, optional `preheader`, a `theme`, and an ordered list (max **50**) of blocks drawn from a **closed vocabulary**:

```
heading | text | button | image | divider | spacer | footer
```

Anything outside that vocabulary (or outside the declared `variables[]` contract) is stripped on `repairEmailDoc`, so the renderer can never choke on untrusted input. `theme.fontFamily` is a single id from the shared **font library** (`FONTS`: web-safe stacks plus popular Google fonts — Inter, Roboto, Montserrat, Playfair Display, Merriweather, JetBrains Mono, …). That one font is applied to **every** element (email clients don't reliably inherit), with the Google stylesheet linked in `<head>` and a real fallback stack always present. Read the list via `FONTS` / `fontById(id)` / `fontStack(id)`.

### The typed variable / merge contract

```ts
EmailVariable {
  name: string;
  type: "string" | "number" | "url" | "date" | "boolean";
  required: boolean;
  default?: unknown;
  label?: string;
}
```

- `reconcileVariables(doc)` → the canonical `used ∪ declared` set (stable order, never drops a used var).
- `validateVariables(...)` → checks concrete values against the contract.
- `buildTemplateModel(template, values)` → the Postmark `TemplateModel` skeleton (seeded `values → default → type-zero`) — **the handoff a Camunda outbound task enforces in Java** by reading the artifact's `variables[]` JSON.
- `previewValues(template)` → realistic sample values for the builder preview.
- `mergePreview(html, values)` → substitutes `{{vars}}` into rendered HTML with Postmark-faithful escaping, so the builder shows the *actual recipient email* (published html/text still keep `{{vars}}` literal).

### Compile pipeline

```
EmailDoc ──validate/repair──▶ safe EmailDoc ──compileEmail──▶ { subject, html, text, variables }
   (email-core, never throws)                  (email-react, react-email + inlined Tailwind)
```

The result — literal `{{vars}}` preserved — is the durable artifact stored by the engine and later merged by Postmark.

## Key features

- **Never-throw model** — `validateEmailDoc`/`repairEmailDoc` are tolerant; malformed or hostile input is coerced to a safe, renderable document rather than raising.
- **Closed block vocabulary** — a fixed 7-block set (max 50), so the renderer's surface is finite and auditable.
- **Typed variable contract** — declared variables with types, `required`, and defaults; reconciled against usage and enforced downstream by the engine.
- **WYSIWYG builder** — the canvas renders the email live as you build; each block is shown via `BlockView` inside an `inert` + aria-hidden overlay so clicks select/drag the row. Undo-redo, keyboard reorder, a Problems panel, and preview-with-sample-data (values edited inline or AI-generated via `onGenerateTestData`).
- **Zero-dependency core** — `email-core` ships no runtime dependencies.

### Security / integrity model

| Guard | Behavior |
|---|---|
| **URL allow-list** | Only `http(s)` (images: `https` only) or a bare `{{variable}}` reach an `href`/`src`; `data:` / `javascript:` / `vbscript:` are dropped (belt over React's escaping). |
| **Color grammar** | Theme/button colors are coerced to a safe set (hex, `rgb/rgba`, `hsl/hsla`, named); `url(...)`, `expression(...)`, etc. fall back to a default — no CSS injection into inlined `style=""`. |
| **Field bounds** | Subject / preheader / text / label / alt / href / src lengths and image width / spacer size are capped — a giant field can't DoS render or bloat the stored template. |
| **HTML-escaped merge** | `mergePreview` substitutes variables with Postmark-faithful escaping. |
| **Preview isolation** | `EmailRenderer` renders inside a sandboxed (`sandbox=""`) iframe. |

## Technology

| Concern | Choice |
|---|---|
| Language | TypeScript 5.6 (ESM-first, dual ESM/CJS output) |
| Monorepo | npm workspaces (`packages/*`), Node ≥ 18 |
| Bundler | tsup (ESM + CJS + `.d.ts`) |
| Rendering | react-email (`@react-email/components` + `@react-email/render`), React ≥ 18 peer |
| Lint | ESLint 9 flat config — TypeScript + react-hooks + jsx-a11y |
| Tests | Vitest + Testing Library (jsdom) — **~82 tests across 10 files** |
| Releases | Changesets |

## Local development

```bash
npm install
npm run build      # email-core → email-react → email-builder (tsup: dual ESM/CJS + d.ts)
npm run typecheck  # run AFTER build — react/builder resolve email-core via its built dist
npm run lint       # eslint (flat config): TS + react-hooks + jsx-a11y
npm test           # vitest across packages
```

::: tip Build before typecheck
`dist/` is gitignored and absent on a fresh checkout, yet `typecheck` and the tests read each package's built `dist/*.d.ts`. Always `npm run build` first; the root build script builds in dependency order.
:::

CI (`.github/workflows/ci.yml`) runs **build → typecheck → lint → test**, plus a blocking supply-chain gate (`npm audit --omit=dev --audit-level=high`, CycloneDX SBOM). A separate `security-scan.yml` runs Semgrep / gitleaks / Trivy.

## Consumption

The [Consumer UI](/apps/consumer-ui) consumes these as **vendored built dist** under `luke-consumer-ui/vendor/@lukeflow/<pkg>/` — not as workspace dependencies. After a change here:

```bash
npm run build   # in luke-email
# copy dist/index.{js,cjs,d.ts,d.cts} (+ styles.css for the builder)
#   into luke-consumer-ui/vendor/@lukeflow/<pkg>/
# then build consumer-ui
```

The AI drafting path (an [Agents (AI)](/services/agents) endpoint that emits an `EmailDoc`) and the builder both feed the same model, so a document produced by either is interchangeable.

## Status & gaps

<span class="pill lib">Alpha</span> — packages are at **`0.1.0-alpha.0`**. The model, renderer, builder, variable contract, and safety layer are built and green (~82 tests), and the library is vendored into the Consumer UI.

- **In scope and done:** the `EmailDoc` model + repair, the typed variable contract, the compile pipeline, the WYSIWYG builder, and the security/integrity guards.
- **Deliberately out of scope:** actual send and inbound — these live as Camunda tasks in the [Core Engine](/services/core-engine) and are tracked there, not here.
- **Alpha caveats:** version pre-1.0, `UNLICENSED`, and consumed via vendored dist (manual copy on each change) rather than a published package.

See the [Completeness Scorecard](/reference/completeness) for where this library sits against the rest of the platform.
