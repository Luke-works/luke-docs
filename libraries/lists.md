# Lists

A headless, framework-agnostic **data-grid (list) engine** for Lukeflow — a typed core plus a React renderer and a column designer. It is the spreadsheet-shaped sibling of the [Forms library](/libraries/forms), built on the same monorepo conventions.

<span class="pill lib">Library (vendored) · headless</span>

> **Repository:** `luke-lists` · **Type:** Headless library (monorepo) · **Packages:** list-core / list-react / list-builder

## Overview

`luke-lists` models a **list** as a standalone data grid: a `ListSchema` (an ordered set of strongly-typed `ColumnDef`s) plus a set of `Row`s of typed cells. It mirrors [`luke-forms`](/libraries/forms) — a pure headless core owns the model, validation, and behavior, while thin React packages provide the runtime renderer and the design-time builder. No DOM or framework concerns leak into the core.

The engine deliberately owns only type-specific cell behavior (parsing, formatting, validation, sort comparison) through a pluggable column-type registry; rendering (selection, keyboard nav, clipboard, fill-handle) is delegated to a swappable grid renderer. This keeps the intellectual property — the schema and column-type system — independent of any particular UI grid.

::: info Where the data lives
The library is **headless and stateless** — it holds rows in memory and can serialize/restore a snapshot, but it does not persist anything. Tenant-scoped persistence (`ListDefinition` / `ListVersion` / `ListRow`) is planned as a `LISTS` [capability](/concepts/capabilities) in `luke-core-engine`, mirroring the FORMS capability. That backend is **not started** (see [Status & gaps](#status-gaps)).
:::

## Architecture

Three npm-workspace packages build in strict dependency order (`list-core` → `list-react` → `list-builder`):

| Package | Public surface | Responsibility |
| --- | --- | --- |
| `@lukeflow/list-core` | `createListEngine`, `ColumnTypeRegistry` / `createDefaultColumnTypeRegistry` / `defaultColumnTypeRegistry`, `validateSchema`, plus the model types | Headless engine: `ListSchema` model, extensible column-type registry, row store, typed cell mutation, filter/sort view, validation, serialize/restore, change subscriptions. No DOM, no React. |
| `@lukeflow/list-react` | `useListEngine`, `ListGrid` (`ListGridProps`) | React adapter + grid renderer. Wraps `react-data-grid` (MIT) for the Excel-style interaction layer. Renderer is swappable. |
| `@lukeflow/list-builder` | `useListBuilder` (`ListBuilderController`, `UseListBuilderOptions`), `ListBuilder` (`ListBuilderProps`) | React column/schema designer built on the engine. |

### The `ListEngine`

`createListEngine(schema, options)` returns a `ListEngine` that owns the row store and exposes a filtered-and-sorted **view** over the rows — with no rendering concerns. A renderer drives it through `setCell`/`addRow`/`removeRow`/`moveRow`, re-reads `getView()`, and `subscribe`s for change notifications.

```ts
import { createListEngine } from "@lukeflow/list-core";

const engine = createListEngine({
  name: "Invoices",
  columns: [
    { key: "vendor", label: "Vendor", type: "text", required: true },
    { key: "amount", label: "Amount", type: "currency" },
    { key: "paid", label: "Paid", type: "boolean" },
  ],
});

const row = engine.addRow({ vendor: "Acme" });
engine.setCell(row.id, "amount", "$1,250.00"); // parsed → 1250
engine.setSort({ columnKey: "amount", direction: "desc" });

const report = engine.validate(); // { ok, errors: CellError[] }
const snapshot = engine.serialize(); // { schema, rows } — persist & restore later
```

### The column-type registry

Each column type is a `ColumnTypeHandler` owning `empty` / `parse` / `format` / `validate` / `compare`. The built-in registry ships `text`, `number`, `currency`, `boolean`, `date`, and `select`. The `ColumnType` union is intentionally **open** (`string & {}`), so custom types can be registered without touching the core. `parse` is **total** — an unparseable input resolves to the empty value rather than throwing, so the engine never crashes on bad data; `validate` (not `parse`) is what reports the problem.

```ts
import { createDefaultColumnTypeRegistry } from "@lukeflow/list-core";

const registry = createDefaultColumnTypeRegistry();
registry.register({
  type: "email",
  empty: () => null,
  parse: (input) => (input == null || input === "" ? null : String(input)),
  format: (v) => (v === null ? "" : String(v)),
  validate: (v, col) =>
    v && !String(v).includes("@") ? `${col.label} must be an email` : null,
  compare: (a, b) => String(a ?? "").localeCompare(String(b ?? "")),
});

const engine = createListEngine(schema, { registry });
```

## Key features

- **Typed cell mutation** — `setCell` routes every raw input through the column type's `parse`, so stored values are always canonical (e.g. `"$1,250"` → `1250`).
- **Filtered + sorted view** — `setFilters` / `setSort` maintain a derived `getView()`; filter operators include `eq`, `neq`, `contains`, `gt`/`gte`/`lt`/`lte`, and `empty`/`notEmpty`. Empty cells always sort last.
- **Validation** — per-cell `validate()` returns a whole-list `ValidationReport` of `CellError`s; `validateSchema()` separately checks the design-time schema (non-empty name, ≥1 column, unique non-empty keys, known types, `select` options present).
- **Serialize / restore** — `serialize()` produces a `{ schema, rows }` snapshot; `createListEngine` re-canonicalizes `initialRows` through their column types on restore.
- **Change subscriptions** — `subscribe(listener)` returns an unsubscribe function; every mutation emits.
- **Extensible column types** — register custom `ColumnTypeHandler`s or clone the default registry.
- **Defensive hardening** — `setCell`/`getCell`/`removeRow`/`moveRow` are no-ops on unknown row or column ids; `readOnly` columns reject writes; `moveRow` clamps its target index; restored `row-N` ids never collide with the engine's monotonic id counter; imported cells are canonicalized.

::: tip Renderer is swappable
`list-react` wraps `react-data-grid` (a free MIT grid) purely for the interaction layer. Because all type behavior lives in `list-core`, the grid renderer can be replaced without changing the engine or schema.
:::

## Technology

| Concern | Choice |
| --- | --- |
| Language | TypeScript (ESM, `type: module`) |
| Monorepo | npm workspaces (`packages/*`) |
| Build | `tsup` — dual ESM + CJS output with `.d.ts` |
| Tests | Vitest (jsdom for React packages) |
| UI runtime | React 19 (peer `>=18`) |
| Grid | `react-data-grid` `7.0.0-beta.59` (peer `^7.0.0-beta.50`) |
| CI | GitHub Actions: `build → typecheck → test`, plus a blocking supply-chain audit gate |
| Node | `>=18` (CI runs Node 20) |
| Versioning | `0.1.0-alpha.0`, `UNLICENSED` (vendored, private) |

The CI `build-test` job builds **first** on purpose: typecheck and cross-package tests resolve siblings through their built `dist/*.d.ts`, which is gitignored. A separate `supply-chain` job runs `npm audit --omit=dev --audit-level=high` and **fails the build** on any high/critical advisory in runtime dependencies.

## Local development

```bash
npm install
npm run build       # builds list-core → list-react → list-builder (dependency order)
npm run typecheck
npm test
```

::: warning Rebuild the core before testing adapters
Cross-package imports resolve via **dist**, so `list-core` must be built before running `list-react` / `list-builder` tests. `npm run build` handles the ordering; run it after changing the core.
:::

Consumption follows the same vendored-dist model as [`luke-forms`](/libraries/forms): each package's built `dist` (plus `styles.css`) is copied into `luke-consumer-ui/vendor/@lukeflow/<pkg>/dist` rather than published to a registry.

## Status & gaps

**Alpha, vendored / local-only.** The library builds green and is consumed by `luke-consumer-ui` via vendored dist, but `luke-lists` `main` is **not pushed** to a remote. As of July 2026:

- **`LISTS` backend capability is not started.** There is no `luke-core-engine` persistence layer (`ListDefinition` / `ListVersion` / `ListRow`, tenant-scoped RBAC) yet — it is a planned [capability](/concepts/capabilities) mirroring FORMS, to be built after the library stabilizes. The engine is in-memory only.
- **No CSV import/export** and **no pagination or virtualization** — the grid renders the full view, which will not scale to large lists yet.
- **Thin React/builder tests.** The `list-react` and `list-builder` test scripts run with `--passWithNoTests`; near-all coverage is in `list-core`. Total suite is ~27 tests across 6 files, concentrated in the engine and column-registry specs.

See the [Completeness Scorecard](/reference/completeness) for how Lists ranks against the other Lukeflow libraries and capabilities.
