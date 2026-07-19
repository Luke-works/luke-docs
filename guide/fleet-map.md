# The Fleet

Every `luke-*` repository at a glance, grouped by role, with its status and manual page.
For scored ratings across six metrics, see the [Completeness Scorecard](/reference/completeness).

## Platform services

The deployed backend.

| Repo | Role | Stack | Status | Page |
| --- | --- | --- | --- | --- |
| `luke-core-engine` | BPMN engine + capability data layer | Java / Spring / FluxNova | <span class="pill partial">Partial · deployed</span> | [Core Engine](/services/core-engine) |
| `luke-auth-engine` | WorkOS ↔ engine auth gateway | Java / Spring | <span class="pill ready">Ready · deployed</span> | [Auth Engine](/services/auth-engine) |
| `luke-file-proxy` | S3 byte-proxy + PDF render | Java / Spring + Chromium | <span class="pill partial">Partial · deployed</span> | [File Proxy](/services/file-proxy) |
| `luke-agents` | AI agent fleet | Python / FastAPI / Groq | <span class="pill ready">Ready · deployed</span> | [Agents](/services/agents) |

## Applications

The user-facing surfaces.

| Repo | Role | Stack | Status | Page |
| --- | --- | --- | --- | --- |
| `luke-consumer-ui` | Tenant orchestrator UI | React 19 / Vite / TailAdmin | <span class="pill partial">Partial · deployed</span> | [Consumer UI](/apps/consumer-ui) |
| `luke-core-ui` | Operator cockpit | React 19 / Vite / TailAdmin | <span class="pill partial">Partial · deployed</span> | [Core UI](/apps/core-ui) |
| `luke-marketing-ui` | Public marketing site | React 19 / Vite | <span class="pill exp">Static · not wired to deploy</span> | [Marketing Site](/apps/marketing-ui) |

## Headless libraries

Framework-agnostic engines (`core` + `react` + `builder`), vendored into the apps as built dist.

| Repo | Role | Packages | Status | Page |
| --- | --- | --- | --- | --- |
| `luke-forms` | Form engine | core / react / builder / embed | <span class="pill ready">Ready · vendored</span> | [Forms](/libraries/forms) |
| `luke-email` | Email template engine | core / react / builder | <span class="pill lib">Library · vendored</span> | [Email](/libraries/email) |
| `luke-signatures` | E-signature UI + contract | sign-core / sign-react | <span class="pill lib">Library · vendored</span> | [Signatures](/libraries/signatures) |
| `luke-lists` | Data-grid engine | list-core / react / builder | <span class="pill lib">Library · backend TBD</span> | [Lists](/libraries/lists) |
| `luke-analytics` | Analytics engine | analytics-core / react / builder | <span class="pill lib">Library · backend TBD</span> | [Analytics](/libraries/analytics) |
| `luke-workflow` | Workflow authoring | workflow-core / builder | <span class="pill exp">Pre-launch · flag-gated</span> | [Workflow](/libraries/workflow) |

## Operations

Deploy blueprints, runbooks, security and test assets.

| Repo | Role | Status | Page |
| --- | --- | --- | --- |
| `luke-platform` | Render blueprint + fleet runbooks + security program | <span class="pill partial">Active · prod deferred</span> | [Platform & Deployment](/operations/platform) |
| `luke-api-collection` | Postman collection (dev/qa/prod) | <span class="pill partial">Active · prod env TBD</span> | [API Collection](/operations/api-collection) |

## Retired / merged

| Repo | Fate |
| --- | --- |
| `luke-capability-engine` | **Empty shell** — merged into `luke-core-engine`'s in-process capability layer |
| `luke-signature-engine` | **Empty shell** — merged into `luke-core-engine` |
| `luke-task-engine` | **Experimental precursor** ("WorkerFlow") — superseded by the engine's outbox/job-worker model; no longer developed |

::: info Legend
<span class="pill ready">Ready</span> production-grade ·
<span class="pill partial">Partial</span> shipped but with known gaps ·
<span class="pill lib">Library</span> headless lib, vendored ·
<span class="pill exp">Experimental</span> pre-launch / not wired
:::
