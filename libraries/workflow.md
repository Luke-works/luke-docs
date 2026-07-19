# Workflow

Lukeflow's headless **workflow authoring model** — a framework-agnostic JSON DSL for a graph of Trigger / Action / Task / Branch / Parallel / Wait / End nodes, plus a react-flow visual designer over it. The JSON is compiled to BPMN **server-side** by the [Core Engine](/services/core-engine); this repo owns the *authoring model*, never a runtime. <span class="pill exp">Pre-launch · flag-gated</span>

> **Repository:** `luke-workflow` · **Type:** Headless library (monorepo) · **Packages:** workflow-core / workflow-builder (workflow-react planned)

## Overview

A **workflow** is a graph of nodes authored as plain JSON. Every [capability](/concepts/capabilities) (Forms, Email, Phone, Sign, Documents, and Integrations via Nango) is *dual* — an inbound **Trigger** and an outbound **Action**, plus an optional human **Task** — so the same small model spans the whole fleet. A `WorkflowDoc` carries a single `trigger`, a list of `nodes`, and optional persisted canvas `layout`:

```jsonc
{
  "id": "wf_onboard",
  "version": 3,
  "trigger": { "capability": "forms", "type": "form.submitted", "config": { "formId": "…" } },
  "nodes": [
    { "id": "n1", "kind": "action", "capability": "email", "action": "send", "next": "n2" },
    { "id": "n2", "kind": "task",   "capability": "forms", "task": "review", "next": "n3" },
    { "id": "n3", "kind": "branch", "conditions": [{ "expr": "amount > 10000", "next": "n4" }], "else": "end" }
  ]
}
```

`luke-workflow` owns exactly one thing: the **portable JSON contract** the builder authors, the tools target, and the backend re-validates. It is a React-free, DOM-free, engine-free *description of a graph*.

::: warning Pre-launch and flag-gated — not yet live
The **WORKFLOW capability is hidden from all UI** in the [Consumer UI](/apps/consumer-ui) behind the `VITE_WORKFLOW_ENABLED` build flag (default **off**): nav, routes, and access lists are suppressed until launch. The library is **not published to npm and not vendored** into any app yet, and the third advertised package (`@lukeflow/workflow-react`) is **planned but unbuilt**. Treat everything here as pre-1.0.
:::

::: tip Deliberately NOT a runtime
This library does **no BPMN compilation and no execution.** Expression strings, retry policies, timers, and message correlation are all described here but *evaluated server-side* — the [Core Engine](/services/core-engine) re-validates the JSON, compiles it to BPMN, and runs it on Camunda/CIBSeven with its outbox + job-worker rails. The `createWorkflowEngine` façade in `workflow-core` is a read-only traversal/validation helper, not an interpreter.
:::

## Architecture

The repo is a TypeScript **npm-workspaces monorepo** (`packages/*`, tsup dual ESM/CJS + `.d.ts`, Node ≥ 18).

| Package | Version | Status | What it provides |
|---|---|---|---|
| **`@lukeflow/workflow-core`** | `0.1.0-alpha.0` | Complete | Headless model: the `WorkflowDoc` JSON DSL + TypeScript types, the emitted JSON Schema artifact (`workflowJsonSchema`), `validateWorkflow` + `repairWorkflow`, the step-type **registry**, graph primitives (`reachableFrom`, `nodeRefs`, `startNodeId`), and the thin `createWorkflowEngine` façade. No React, no transport, no Nango. |
| **`@lukeflow/workflow-builder`** | `0.1.0-alpha.0` | Built (alpha) | The **react-flow** (`@xyflow/react`) visual designer over the JSON model: `WorkflowBuilder`, `docToFlow`/`flowToDoc`, a data-driven `buildPalette` (fed from the host's `GET /api/workflow/catalog`), auto-layout, and node operations (`addStep`, `connectNodes`, `removeNode`, …). React 18/19 peer. |
| **`@lukeflow/workflow-react`** | *(none)* | **Planned — unbuilt** | Intended headless React for connection/run management (`<ConnectIntegration>`, `<ConnectionsManager>`, `<RunInspector>`) with a host-injected adapter. Does not exist in the repo yet. |

### The seven node kinds

The graph starts at a **Trigger** and every path terminates at **End** (the reserved `"end"` target, or `null`/absent). Between them sit the five executable `NodeKind`s:

| Kind | Role | Compiles server-side to |
|---|---|---|
| **trigger** | How the workflow starts — a capability's inbound event | BPMN message start event |
| **action** | An outbound effect via a capability (`send`, `upsertOpportunity`, …) | BPMN service task on the outbound rail |
| **task** | A human/async task — assign, then wait for completion | BPMN user/receive task (rides both rails) |
| **branch** | Exclusive choice — first truthy condition wins, else `else` | BPMN exclusive gateway |
| **parallel** | Fork/join — run branches concurrently, continue at `join` | BPMN parallel gateway pair |
| **wait** | Pause on a `timer` duration or until an `event` correlates | BPMN timer / message-catch event |
| **end** | Reserved terminal target — the path terminates | *(no node — path end)* |

Node kind and capability are kept open where it matters: `CapabilityId` is an open `string` (not a closed union) so new capabilities register step types without a model bump — an unknown capability surfaces as a **registry diagnostic**, not a type error.

## Key features

- **Portable JSON DSL** — a frozen on-disk `WorkflowDoc` shape (`id`, `version`, `trigger`, `nodes`, optional `start`, `settings`, `layout`) that is the single contract shared by builder, tools, and the compiler.
- **JSON Schema artifact** — `workflowJsonSchema` is emitted from the model for host-side / cross-language validation.
- **Tolerant validation** — `validateWorkflow` returns structured [`Diagnostic`s](#) and **never throws**. There are **15 stable diagnostic codes** (e.g. `missing-trigger`, `duplicate-node-id`, `invalid-node-kind`, `dangling-ref`, `unreachable-node`, `unknown-step-type`), each with a machine-readable `code` + `context` and an `error`/`warning`/`info` severity so UIs can gate publish on `hasErrors` without re-scanning.
- **Conservative repair** — `repairWorkflow` runs on a **total deep clone** (`structuredClone`, with a never-throw fallback), dropping duplicate-id nodes, rewiring dangling `next`/`else`/`fallback`/`join` targets to `"end"`, and pruning branch/parallel arms whose targets vanished. It never fabricates a trigger — it can't invent intent — so callers still validate afterward.
- **Step-type registry** — `createStepTypeRegistry` + `missingStepTypes` model the `(capability, kind)` catalog a tenant may draw from; the builder's palette is built directly from it, so a new capability appears simply by publishing descriptors.
- **Graph traversal engine** — `createWorkflowEngine(doc, { repair })` is a read-only façade (mirroring `createFormEngine` in [Forms](/libraries/forms)) bundling `validate`/`report`, `startId`, `nodeById`, `successors`, `reachable`, and `isTerminal` over one document.
- **Golden fixtures** — a canonical `goldenWorkflow` + `referenceStepTypes` are exported for downstream tests and demos and pinned by golden-fixture tests.
- **~61 tests across 12 files** (Vitest) — covering the golden fixtures, validation, repair, registry, JSON Schema, and the builder's graph/palette/layout/operations helpers.

## Technology

| Concern | Choice |
|---|---|
| Language | TypeScript ^5.6 |
| Monorepo | npm workspaces (`packages/*`) |
| Build | tsup (dual ESM + CJS, `.d.ts`) |
| Tests | Vitest ^2.1 |
| Runtime | Node ≥ 18 |
| Builder UI | react-flow / `@xyflow/react` ^12, React 18/19 (peer) |
| Core deps | *zero runtime deps* (headless model) |

## Local development

```bash
npm install

# workflow-core (the headless model)
npm run -w @lukeflow/workflow-core test
npm run -w @lukeflow/workflow-core typecheck
npm run -w @lukeflow/workflow-core build

# workflow-builder (react-flow designer)
npm run -w @lukeflow/workflow-builder test
npm run -w @lukeflow/workflow-builder build

# or across the whole workspace
npm run build   # && test / typecheck (--if-present)
```

## Status & gaps

As of **July 2026** the library is pre-launch and unshipped, but was **hardened (67 → 81)**:

::: tip Hardened
Added **CI** (`.github/workflows/ci.yml`: build → typecheck → **API-surface guard** → **size
budget** → test + supply-chain audit + SBOM), committed `api-reports/` for both packages, a
`workflow-core` property/fuzz suite (repair/validate never throw + idempotent; graph
reachability + the step-type registry on the golden workflow), and `SECURITY.md` /
`docs/USAGE.md`. Also fixed a **clean-checkout build-order bug** (builder was building before
core) and latent typecheck errors that had no CI to catch them. CI-green.
:::

Remaining gaps:

- **`@lukeflow/workflow-react` is unbuilt.** Only two of the three advertised packages exist; the connection/run-inspection React layer is still just a plan.
- **Not published or vendored.** No npm publish, and it is not vendored into the [Consumer UI](/apps/consumer-ui) the way [Forms](/libraries/forms) / [Email](/libraries/email) are.
- **Flag-gated & hidden.** The WORKFLOW [capability](/concepts/capabilities) is suppressed everywhere behind `VITE_WORKFLOW_ENABLED` (default off) until launch.
- **Expression analysis is minimal.** `ExpressionString`s (`amount > 10000`) are checked only for non-emptiness in V1; static analysis of the sandbox grammar is a later milestone.

See the [Completeness Scorecard](/reference/completeness) for how this sits relative to the shipped libraries.
