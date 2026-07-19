# Analytics

Lukeflow's headless **analytics engine** — a framework-agnostic query engine over in-memory datasets, a React renderer that draws the results with Nivo, and a dashboard designer. It mirrors the structure of [Forms](/libraries/forms) and [Lists](/libraries/lists), and is built to be vendored into the [Consumer UI](/apps/consumer-ui). <span class="pill lib">Library (vendored-ready) · headless</span>

> **Repository:** `luke-analytics` · **Type:** Headless library (monorepo) · **Packages:** analytics-core / analytics-react / analytics-builder

## Overview

`luke-analytics` turns a strongly-typed record set into charts through three cleanly separated stages:

1. a pure **query engine** (`analytics-core`) that groups rows by dimensions and aggregates measures into a tidy `ResultSet`, with no DOM, no React, and no chart library;
2. a thin **React renderer** (`analytics-react`) that maps a `ResultSet` to a chart via `buildChartData` and draws it with Nivo; and
3. a **dashboard builder** (`analytics-builder`) that arranges widgets bound to queries and chart specs.

It is a sibling of the [Forms](/libraries/forms) and [Lists](/libraries/lists) libraries — same npm-workspaces monorepo conventions, same dependency-ordered build, same vendored-dist consumption model. There is **no coupling to FORMS or LISTS**: an analytics *dataset* is standalone (its own `FieldDef[]` + `DataRow[]`), so the engine works on any typed record set you hand it.

::: warning The backend capability does not exist yet
These packages are the **client-side engine only.** The `ANALYTICS` capability in the [Core Engine](/services/core-engine) — persistence of `DashboardDefinition` / `DashboardVersion` + dataset bindings, tenant-scoping, and subscription/grant RBAC, mirroring the [FORMS and LISTS capabilities](/concepts/capabilities) — is **not built**. It is planned to follow the library. Today nothing persists dashboards or enforces access server-side.
:::

## Architecture

The repo is a TypeScript **npm-workspaces monorepo** (`packages/*`) with three packages built in dependency order (tsup, dual ESM/CJS + `.d.ts`).

| Package | Depends on | What it provides |
|---|---|---|
| **`@lukeflow/analytics-core`** | *(nothing — zero runtime deps)* | The headless engine: the `DatasetSchema` / `Query` model, an `AggregationRegistry`, the group-by + aggregate engine (`createAnalyticsEngine`), `validateQuery`, `bucketDate`, and the `buildChartData` chart-data transforms. Pure — no DOM, no React, no chart lib. |
| **`@lukeflow/analytics-react`** | `analytics-core` (react + Nivo peers) | The React adapter: the `useAnalyticsEngine` hook, `AnalyticsChart` / `EngineChart` renderers wrapping **Nivo** (`@nivo/bar`, `@nivo/line`, `@nivo/pie`) for the SVG drawing layer. |
| **`@lukeflow/analytics-builder`** | `analytics-core` (react peer) | The dashboard / widget designer: `DashboardBuilder`, the headless `useDashboardBuilder` controller, and the `Dashboard` / `Widget` model (`createEmptyDashboard`, `defaultChartSpec`). |

### The query model

A **dataset** is a `DatasetSchema` (an ordered, typed `FieldDef[]`) plus `DataRow[]` of raw records. A **query** declares:

- `DimensionDef[]` — the fields to group by, each with an optional date `granularity`;
- `MeasureDef[]` — the fields to aggregate, each with an `AggregationType`; plus
- `filters`, `sort`, and `limit`.

The engine runs the query over the in-memory rows and returns a tidy `ResultSet` — typed `ResultColumn`s (each tagged with a `ColumnRole`) plus grouped `ResultRow`s.

### The pipeline

```
DataRow[] + Query ──validateQuery──▶ ok/problems
        │
        ▼ createAnalyticsEngine (group-by + aggregate over the registry)
   ResultSet ──buildChartData(ChartSpec)──▶ ChartData ──AnalyticsChart──▶ Nivo SVG
     (analytics-core, pure)                              (analytics-react)
```

A **chart** is a `ChartSpec`: a chart `type` (`bar` / `line` / `area` / `pie`) plus an `encoding` that maps result columns to visual channels. `buildChartData` turns a `ResultSet` into the exact shape Nivo expects (`BarDatum` / `LineSeries` / `PieDatum`); `analytics-react` renders it.

### Swappable-renderer boundary

`analytics-core` is pure from-scratch headless IP. `analytics-react` wraps Nivo for the **SVG drawing layer only** — everything the renderer needs crosses the `ChartSpec` + `buildChartData` boundary as plain data. Because the drawing layer sits behind that boundary, Nivo could be swapped for another chart library without touching the engine, the query model, or the transforms.

## Key features

- **Pure headless engine** — `analytics-core` has zero runtime dependencies; the query model, aggregation math, validation, and chart transforms carry no DOM or framework assumptions.
- **Pluggable aggregations** — measures are handlers (`init` / `step` / `finalize`) in an `AggregationRegistry`. `count`, `sum`, `avg`, `min`, `max`, `countDistinct`, and `median` are built in; custom ones register without the engine hard-coding any math.
- **Query validation** — `validateQuery` returns a structured `QueryReport` of `QueryProblem`s (e.g. unknown fields, type-incompatible aggregations) before the engine runs.
- **Date bucketing** — `bucketDate` groups a date dimension by `granularity` for time-series grouping.
- **Tidy result model** — a `ResultSet` of typed, role-tagged columns and grouped rows is the single contract every consumer reads.
- **Serializable** — a `SerializedAnalytics` form supports round-tripping engine state.
- **Dashboard builder** — `useDashboardBuilder` + `DashboardBuilder` arrange `Widget`s (each a query + `ChartSpec` + `WidgetLayout`) into a `Dashboard`.

## Technology

| Concern | Choice |
|---|---|
| Language | TypeScript 5.6 (ESM-first, dual ESM/CJS output) |
| Monorepo | npm workspaces (`packages/*`), Node ≥ 18 |
| Bundler | tsup (ESM + CJS + `.d.ts`) |
| UI framework | React 19 (`>=18` peer) |
| Charts | Nivo `@nivo/bar` · `@nivo/line` · `@nivo/pie` (`^0.99`, peer of `analytics-react`) |
| Tests | Vitest (jsdom) + Testing Library — **~72 tests across 10 files** |
| CI | build → typecheck → test, plus a blocking `npm audit` supply-chain gate |

Test coverage skews to the pure core: the group-by/aggregate engine (12), `validateQuery` (20), the aggregation registry (12), chart transforms (7), and `bucketDate` (4); `analytics-react` (`useAnalyticsEngine`, `AnalyticsChart`) and `analytics-builder` (model, `useDashboardBuilder`, `DashboardBuilder`) are covered too.

## Local development

```bash
npm install
npm run build      # analytics-core → analytics-react → analytics-builder (dependency order)
npm run typecheck  # run AFTER build — react/builder resolve analytics-core via its built dist
npm test           # vitest across packages
```

::: tip Build before typecheck and tests
`dist/` is gitignored and absent on a fresh checkout, yet `typecheck` and the tests resolve each package via `analytics-core`'s built `dist`. Always `npm run build` first — the root build script builds in dependency order. CI does the same (`build → typecheck → test`).
:::

::: warning Nivo under jsdom
Nivo needs browser APIs jsdom lacks (`ResizeObserver`, `matchMedia`); the react package's `test/setup.ts` polyfills them. Render charts non-responsively (fixed width/height, `animate={false}`) under Vitest.
:::

CI (`.github/workflows/ci.yml`) runs **build → typecheck → test** on Node 20, plus a **blocking supply-chain gate** (`npm audit --omit=dev --audit-level=high`) that fails on any high/critical advisory in runtime dependencies.

## Status & gaps

<span class="pill lib">Alpha</span> — packages are at **`0.1.0-alpha.0`**, `UNLICENSED`. The query engine, aggregation registry, validation, chart transforms, React/Nivo renderer, and dashboard builder are built and green (~72 tests).

- **Done (client-side):** the `DatasetSchema` / `Query` model, the group-by + aggregate engine, the pluggable aggregation registry, `validateQuery`, `buildChartData`, the `useAnalyticsEngine` hook + Nivo `AnalyticsChart`, and the dashboard builder.
- **Not built — the backend capability:** the `ANALYTICS` capability in the [Core Engine](/services/core-engine) (dashboard/version persistence, dataset bindings, tenant-scope, subscription + grant RBAC) does **not** exist. Nothing persists dashboards or enforces access server-side yet. It is planned to follow the library, mirroring the FORMS/LISTS [capabilities](/concepts/capabilities).
- **Not yet consumed:** unlike [Email](/libraries/email), the built dist is **not yet vendored into** the [Consumer UI](/apps/consumer-ui) — no app renders these packages today.
- **Young:** the repo is a **single scaffold commit** on local `main` (not pushed); expect the public API surface to still move.

See the [Completeness Scorecard](/reference/completeness) for where this library sits against the rest of the platform.
