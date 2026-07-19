# Capabilities

A **capability** is a domain feature a tenant subscribes to and a BPMN process can invoke:
forms, email, e-signature, phone, documents, access management, calendars/SLA, and
(pre-launch) workflow authoring, lists and analytics.

Capabilities are the organising principle of the platform. This page explains the model;
each capability's mechanics live on the relevant service and library pages.

## The in-process model

Unlike a classic microservice suite, Lukeflow capabilities are **not** separate deployables.
Each capability's **data layer is a module inside the [Core Engine](/services/core-engine)**
Spring application. The BPMN engine orchestrates the process; the capability module owns its
tables and REST endpoints; and Camunda's **outbox / job-worker** machinery writes results
back in the *same database transaction* that advances the process.

::: tip Why in-process
It removes the dual-write problem. "The user task completed" and "the submission/email/
signature was recorded" commit together or not at all — no sagas, no eventual-consistency
reconciliation between a process service and a capability service.
:::

This is why `luke-capability-engine` and `luke-signature-engine` are **empty repositories** —
they were standalone services that got folded into the core (the "capability→core merge").

## The capability catalog

| Capability | What it does | Data layer | Authoring library | Runtime notes |
| --- | --- | --- | --- | --- |
| **Forms** | Render a form, collect & validate a submission, drive a user task | core-engine `form` module | [`luke-forms`](/libraries/forms) | Inbound (embed) & outbound (prefill+send) form kinds; server-side validation |
| **Email** | Manage templates, compile HTML, send transactional email | core-engine `email` + `emailtemplate` | [`luke-email`](/libraries/email) | Template mgmt in the library; **send/inbound are Camunda tasks in the engine** |
| **Signatures** | Design a signing layout, run a signing ceremony, produce a signed PDF | core-engine `signature` module | [`luke-signatures`](/libraries/signatures) | Native **PAdES** signing (PDFBox + BouncyCastle) is engine-side, not in the library |
| **Phone** | Inbound & outbound AI voice calls | core-engine `phone` module | — | Via **Vapi.ai**; engine data layer + Camunda outbox + webhook |
| **Documents** | Store & retrieve tenant files on S3 | core-engine `document` module | — | Bytes are brokered by the [File Proxy](/services/file-proxy), not the engine |
| **Access** | Request/approve capability access; owners grant | core-engine `access` module | — | Members request → owners approve → auto-grant |
| **Calendars / SLA** | Business calendars, holidays, SLA calculation | core-engine (calendar) | — | Surfaced in the [Core UI](/apps/core-ui) cockpit |
| **Workflow** | Author a JSON workflow that compiles to BPMN | core-engine (compile) | [`luke-workflow`](/libraries/workflow) | <span class="pill exp">Pre-launch</span> hidden behind `VITE_WORKFLOW_ENABLED` |
| **Lists** | Headless data-grid capability | *(not started)* | [`luke-lists`](/libraries/lists) | Library only; backend capability not yet built |
| **Analytics** | Query + dashboard capability | *(not started)* | [`luke-analytics`](/libraries/analytics) | Library only; backend capability not yet built |

::: tip Deep dives
This page is the catalog. For the **component-and-function-level** breakdown of each
capability — with architecture diagrams, sequence diagrams of the real call flow, and
tables of every class, service, endpoint and function — see the **Capability Deep-Dives**:
[Forms](/capabilities/forms) · [Email](/capabilities/email) ·
[Signatures](/capabilities/signatures) · [Phone](/capabilities/phone) ·
[Documents](/capabilities/documents) · [Access](/capabilities/access) ·
[Calendars & SLA](/capabilities/calendar) · [Workflow](/capabilities/workflow)
:::

## Anatomy of a capability

Most capabilities have the same three layers:

1. **A headless authoring library** (`luke-forms`, `luke-email`, …) — a framework-agnostic
   TypeScript engine + React renderer + visual builder, tested in isolation and
   [vendored](/libraries/forms) into the apps.
2. **A data-layer module in the engine** — entities, repositories, services and REST
   controllers that persist definitions, versions and instances, scoped per tenant.
3. **BPMN wiring** — the process uses the capability via a user task (forms), a job worker
   / outbox (email send, phone call, PDF render), or a webhook (inbound phone, form embed).

The [Consumer UI](/apps/consumer-ui) presents the tenant-facing surface; the
[Core UI](/apps/core-ui) presents the operator surface.

## Tier gating

Capabilities are gated per tenant. Granting an org-admin currently auto-subscribes the
tenant to a capability; billing-tier gating (before a PREMIUM tier ships) is a known
follow-up. Access is requested and approved through the **Access** capability itself.

## See also

- [Architecture](/guide/architecture) — how a capability threads through a request.
- [Multi-Tenancy](/concepts/tenancy) — how capability data is isolated per tenant.
- [Core Engine](/services/core-engine) — the module list and endpoint surface.
