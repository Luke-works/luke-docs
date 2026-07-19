# Forms

Lukeflow's headless JSON form stack — a framework-agnostic engine, a React renderer, a React builder, and a cross-origin embed SDK. The form behaviour (schema contract, dependency-graph evaluation, validation, logic) lives in **one tested place**; every surface — the fill/response runtime, the visual designer, the embeddable widget — drives that same engine rather than re-implementing it. It is the backing library for the [Forms capability](/concepts/capabilities) and the most mature library in the fleet.

<span class="pill ready">Production-ready · vendored</span>

> **Repository:** `luke-forms` · **Type:** Headless library (monorepo) · **Packages:** form-core / form-react / form-builder / form-embed

## Overview (one tested engine driving every surface)

A form is stored as a plain `{ entities, root, settings }` JSON document. `@lukeflow/form-core` turns that document into a live, headless engine: it builds a dependency graph over the fields, settles conditional show/hide, `calculate`, and logic rules to a fixpoint in a bounded number of passes, runs validation, and hands back the collected data. It has **zero React or DOM dependencies** — the same engine runs in a browser, in Node, and inside tests.

Everything else is an adapter over that core:

- the **renderer** (`form-react`) wires the engine to a fully accessible DOM;
- the **builder** (`form-builder`) drives the engine's pure builder operations from a palette/canvas UI;
- the **embed SDK** (`form-embed`) hosts a rendered form in a cross-origin iframe on any third-party site.

Because the behaviour is centralized, a stored form authored in the builder renders identically in the fill runtime and the embed — the byte-compatible schema is golden-tested so deployed forms keep loading unchanged.

::: info Where this fits
`luke-forms` is a pure UI/engine library. It has no backend of its own: form definitions, versions, submissions, and access control live in [Core Engine](/services/core-engine) (referenced by `formKey`). Secure live data reaches fields through a host-provided proxy — see **Minions** below.
:::

## Architecture

Four npm-workspace packages, published (privately) and versioned together. Each owns exactly one layer:

| Package | Owns | Public surface |
|---------|------|----------------|
| `@lukeflow/form-core` | The headless engine — schema contract, dependency-graph + topological settlement, validation registry, field-type registry, the safe expression parser and the JS logic layer, the Minions data-source contract, and the pure builder operations. No React, no DOM. | `createFormEngine`, `validateSchema` / `repairSchema` / `migrateSchema`, builder ops, expression + JS evaluators, data-source helpers |
| `@lukeflow/form-react` | The React adapter + reference renderer — a complete, a11y-wired `<FormRenderer>` for the full field set, plus i18n, theming, an error boundary, and print/PDF. | `FormRenderer`, `useFormEngine`, `MinionProvider` / `useMinionData`, `LocaleProvider` |
| `@lukeflow/form-builder` | The visual designer — palette, canvas, settings panel, Problems panel, and a live preview built on the headless builder ops and WAI-ARIA keyboard drag-and-drop. | `FormBuilder`, `useFormBuilder` |
| `@lukeflow/form-embed` | A zero-dependency SDK to embed a form on any site via a cross-origin iframe and a secure `postMessage` bridge (ships an IIFE `embed.js` global). | `index` API, `embed.js` |

The dependency direction is strict: `form-core` ← `form-react` ← `form-builder`; `form-embed` is standalone. React is a **peer dependency** (`react >=18`, built against React 19) and is externalized from every bundle, so the consuming app keeps a single React copy.

### Consumption model

The packages are published to a private registry via changesets, but in practice they are **vendored as built `dist` into [Consumer UI](/apps/consumer-ui)** — which is the deployed application. consumer-ui depends on the built artifacts (originally through `file:` links during cutover) rather than pulling from npm. See [Consumption](#consumption) below.

## Key features

- **~Form.io-parity field set** — text / textarea / email / url / password / phone / number / currency / checkbox / select / radio / checkboxes / tags / file / signature / date / time, plus panels, layout containers, and **data grids**.
- **Breadth controls** — rating, ranking, matrix, address block, and rich-text fields, each fully keyboard- and screen-reader-operable.
- **Conditional logic** — show/hide, `calculate`, and a logic table (show / hide / enable / disable / require / setValue) with a defined value precedence (`seed < default < customDefault < calculate < logicSetValue < user`), `clearOnHide`, and bounded multi-pass settlement that reaches a fixpoint in 1–3 passes.
- **Grids** with per-row calculated cells (intra-row chains) and per-row validation; a 5000-row calc grid inits in ~17 ms.
- **Two logic tiers** — a safe expression grammar (default, untrusted-author-safe) and a trusted-author JavaScript layer (`calculateValueJs` / `customConditionalJs` / `customValidationJs` / `customDefaultValueJs`), gateable and sandboxable (see [Security & accessibility](#security-accessibility)).
- **Minions** — a secure data-source contract: fields fetch options, type-ahead results, file storage, and async validation through a host-provided `MinionClient` whose auth/authz live entirely server-side.
- **Wizard forms**, localization (`LocaleProvider`), CSS-token theming, resume-from-snapshot (`serialize` / `restore`), schema migrations, an evaluation trace, an error boundary, an `onEvent` observability hook, print/PDF (`printSubmission`), autofill suppression, and a leave-guard.
- **`content-visibility`-based virtualization** (`virtualize`) for long forms — off-screen rows skip layout and paint but stay in the DOM, so focus-on-error, tab order, browser Find, and validation all keep working (unlike JS windowing).

## Security & accessibility

Security is the library's headline strength, and the model is explicit about **two principals**: the **author** (builds the form — trust depends on your deployment) and the **filler** (submits data — *never* trusted). A filler can only supply field *values*, which are always treated as data; the interesting boundary is how much the author is trusted, because a form definition carries two author-controlled surfaces: HTML markup and JavaScript logic.

**Author HTML is sanitized by default.** `content`/`html` markup is run through **DOMPurify** before it reaches the DOM, stripping `<script>`, event-handler attributes, and `javascript:` URLs. The sanitizer is **SSR-aware**: with no DOM it escapes markup to inert text rather than emit anything unsanitized, and a DOM-backed policy can be injected for real SSR HTML.

**Expressions are safe even for untrusted authors.** `calculateValue` / `customConditional` / `customValidation` / `customDefaultValue` and logic `when`/`value` run through an **in-house `exprParser`** (not JavaScript) that replaced the vulnerable `expr-eval` dependency. Member access is disabled, hostile identifiers (`constructor`, `__proto__`, `prototype`, …) are blocked, unknown identifiers resolve to `undefined`, and evaluation is **fail-open** — a bad expression records a diagnostic but never blanks a field or wedges a submit. A **prototype-pollution guard** backs this.

**Author JavaScript has three postures**, chosen by author trust:

| Author trust | Posture | How |
|--------------|---------|-----|
| Fully trusted (internal authors) | built-in `Function` evaluator (fast; *not* a security boundary) | default |
| Untrusted, no JS needed | disable JS entirely — only the safe expr layer runs | `allowJs: false` |
| Untrusted, JS required | true realm isolation | inject `createQuickJsEvaluator()` |

The **QuickJS WASM sandbox** runs each snippet in a WebAssembly VM with its own realm and globals, a per-eval memory cap (default 8 MiB), and a wall-clock deadline (default 100 ms). Author JS therefore cannot reach `window`/`process`/`fetch`, cannot escape via the `Function` constructor, cannot exhaust host memory, and cannot hang the tab; communication is JSON-only and a throw/timeout/overflow fails open. `quickjs-emscripten` is an **optional** peer dependency, installed only for this posture.

::: tip CSP-friendly
The renderer needs no `unsafe-inline` / `unsafe-eval` for its own code. QuickJS needs only `wasm-unsafe-eval`; the built-in `Function` evaluator needs `unsafe-eval`, so prefer `allowJs: false` or QuickJS under a strict CSP. Full guidance in `docs/SECURITY.md`.
:::

**Accessibility** targets **WCAG 2.1 AA** for both the renderer and the builder. **axe-core** (`wcag2a` + `wcag2aa`) runs in CI via Playwright across Chromium, Firefox, and WebKit — over the renderer, wizard, data-grid, builder, error state, expanded combobox, modal/tabbed settings, the breadth controls, and dark mode — failing on any serious/critical violation. Most criteria are marked *Supports*; two are *Partially* (resting input-border contrast for 1.4.11; tooltips not individually Escape-dismissible for 1.4.13). Automated testing catches only ~30–40% of WCAG issues, so a **manual assistive-technology matrix** (NVDA/JAWS/VoiceOver/TalkBack) ships as a checklist — but has **not** been human-executed (see [Status & gaps](#status-gaps)).

## Technology

| Concern | Choice |
|---------|--------|
| Language | TypeScript 5.6 (strict) |
| Repo layout | npm workspaces monorepo (`packages/*`, `examples/*`) |
| UI framework | React 19 (peer `react >=18`, externalized) |
| Bundler | `tsup` (ESM + CJS + `.d.ts` per package) |
| Unit tests | Vitest (+ `fast-check` property/fuzz), jsdom |
| E2E | Playwright across Chromium / Firefox / WebKit |
| A11y testing | `@axe-core/playwright` |
| HTML sanitizer | DOMPurify 3.4 (SSR-aware) |
| JS sandbox | QuickJS via `quickjs-emscripten` (optional peer) |
| Expression engine | in-house `exprParser` (replaced `expr-eval`) |
| Release | Changesets; TypeDoc for API docs; API-Extractor-style surface guard |

## Local development

Standard npm-workspace flow; the root `build` builds packages in dependency order (typecheck and the API-surface guard read each package's built `dist/*.d.ts`, and `dist` is gitignored, so build first):

```bash
npm install

# build all packages in dependency order (core → react → builder → embed)
npm run build

npm run typecheck     # tsc --noEmit across the workspace
npm run api           # public-API surface guard (enforced in CI)
npm run size          # per-bundle size-budget check
npm test              # ~570 Vitest tests across 36 files
npm run e2e           # 15 Playwright specs (incl. axe-core a11y)

npm run bench         # engine perf benchmark (see docs/BENCHMARKS.md)
```

The test suite is deep: ~570 tests over 36 files, including property-based **fuzz** suites (`engine.fuzz`, `security.fuzz` — 30+ escape/RCE/pollution attempts plus hundreds of random inputs), **perf** tests, and **golden** schema tests. The 15 E2E specs cover the renderer, builder, wizard, grid, keyboard nav, minions, signature, and accessibility.

CI runs three jobs on every push/PR:

```
build-test:    npm ci → build → typecheck → api (surface guard)
               → size (budget) → test
e2e:           build → playwright install (3 engines) → e2e
supply-chain:  npm audit --omit=dev --audit-level=high   (BLOCKING; runtime tree = 0 vulns)
               → npm sbom (CycloneDX)  → upload SBOM artifact
```

The supply-chain gate blocks on any high/critical advisory in **runtime** dependencies — the reason `expr-eval` (which had an unfixed high) was replaced by the in-house parser — and every build uploads a CycloneDX **SBOM** of the production tree.

## Consumption

The packages are versioned for a private registry, but the live consumption path is **vendored built `dist` into [Consumer UI](/apps/consumer-ui)** (the deployed app). The cutover replaced consumer-ui's in-tree engine/renderer/builder in two waves — renderer first (low risk), builder second:

| Package | Replaced in consumer-ui |
|---------|-------------------------|
| `@lukeflow/form-core` | `src/lib/formSchema.ts`, `src/lib/expression.ts` |
| `@lukeflow/form-react` | in-tree `FormRenderer.tsx` |
| `@lukeflow/form-builder` | `formBuilder.ts`, `FormBuilderPage.tsx` |

During local development the app points at the local builds via `file:` links (`file:../luke-forms/packages/form-core`, …), so `npm run build` in `luke-forms` must run first. React stays a single copy — if a duplicate surfaces in Vite's optimize step, dedupe `react` / add the packages to `optimizeDeps.exclude`. Rendering a stored form is a matter of:

```tsx
import { FormRenderer } from "@lukeflow/form-react";
import "@lukeflow/form-react/styles.css";

<FormRenderer
  schema={schema}                 // stored { entities, root, settings }
  initialValues={{ qty: 2 }}
  onSubmit={(data) => save(data)}
  readOnly={false}
/>;
```

## Status & gaps

- **Version `0.1.0-alpha.0` — not npm-published.** The packages are licensed `UNLICENSED` and consumed as vendored `dist`, not from a public registry. The alpha version reflects the release channel, not the maturity of the code — this is the most battle-tested library in the fleet.
- **Manual accessibility audit not human-run.** The AA conformance claim is *self-assessed*: axe-core is enforced in CI, but the manual assistive-technology matrix (NVDA / JAWS / VoiceOver / TalkBack) is shipped as a test plan and has not been executed by a human. No third-party-signed VPAT exists.
- **Two known partial WCAG criteria** — resting input-border contrast (1.4.11) and non-Escape-dismissible tooltips (1.4.13). Both are tracked and neither blocks the AA text/UX criteria.
- **QuickJS is opt-in.** Untrusted-author JS is only truly sandboxed when the QuickJS evaluator is wired; the default `Function` evaluator is explicitly *not* a security boundary and is intended for trusted authors.

For how Forms scores against the rest of the fleet, see the [Completeness Scorecard](/reference/completeness).
