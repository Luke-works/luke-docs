# Introduction

**Lukeflow** is a multi-tenant business-process platform. At its centre is a
**BPMN 2.0 process engine**; around it sits a fleet of **capabilities** (forms, email,
e-signature, phone, documents, access management, workflow authoring) and the
**applications** and **headless libraries** that expose them.

This manual documents every moving part of that fleet — the `luke-*` repositories — as
of **July 2026**.

## The core idea

A tenant models their business process as a **BPMN diagram** and deploys it to the
engine. As the process runs, it needs to *do things in the real world*: render a form
and wait for a submission, send an email, collect a signature, place a phone call, store
a document. In Lukeflow those actions are **capabilities**, and — critically — they run
**in-process** inside the engine rather than as separate microservices.

The engine orchestrates; a capability's **data layer** lives beside it in the same
Spring application; and Camunda's transactional **outbox / job-worker** machinery writes
results back atomically. This "collapse the capability into the core" decision is the
architectural spine of the platform — see [Architecture](/guide/architecture) and
[Capabilities](/concepts/capabilities).

## The shape of the fleet

The repositories fall into five groups. Each has its own page(s) in this manual.

| Group | Repos | What they are |
| --- | --- | --- |
| **Platform services** | `core-engine`, `auth-engine`, `file-proxy`, `agents` | The deployed backend: the engine + capability data layer, the auth gateway, the S3/PDF proxy, and the AI agents. |
| **Applications** | `consumer-ui`, `core-ui`, `marketing-ui` | The orchestrator UI tenants use, the operator cockpit, and the public marketing site. |
| **Headless libraries** | `forms`, `email`, `signatures`, `lists`, `analytics`, `workflow` | Framework-agnostic engines (`core` + `react` + `builder`) vendored into the apps as built `dist`. |
| **Operations** | `platform`, `api-collection` | The Render deploy blueprint + fleet runbooks + security program, and the Postman API collection. |
| **Retired / merged** | `capability-engine`, `signature-engine`, `task-engine` | Superseded — see below. |

::: info Retired repositories
`luke-capability-engine` and `luke-signature-engine` are **empty shells** — their code was
merged into `luke-core-engine`'s in-process capability layer. `luke-task-engine`
("WorkerFlow") is an **experimental precursor** to the current outbox/job-worker model and
is no longer developed.
:::

## Technology at a glance

- **Engine & services** — Java 21, Spring Boot 3.4, FluxNova (FINOS Camunda-7 fork),
  PostgreSQL + Flyway, deployed as Docker images on Render.
- **AI agents** — Python 3.12, FastAPI, Groq (with OpenAI / Gemini / Ollama brains),
  Redis, PostgreSQL.
- **Applications** — React 19, Vite, TypeScript, Tailwind (TailAdmin base),
  React Query + Zustand.
- **Headless libraries** — TypeScript monorepos (npm workspaces, `tsup` dual ESM/CJS,
  Vitest + Playwright), React 19 renderers, vendored into the apps as built dist.
- **Auth** — WorkOS (front door) → a stateless translator (`auth-engine`) → the engine,
  which is the real enforcer. See [Authentication & Authorization](/concepts/auth).

## How to read this manual

- Start with **[Architecture](/guide/architecture)** for the end-to-end picture and the
  request/data flow.
- **[The Fleet](/guide/fleet-map)** is a one-screen index of every repo with its status.
- The **Concepts** section explains the cross-cutting models: capabilities, auth,
  tenancy and deployment.
- **Platform Services**, **Applications** and **Headless Libraries** each have one page
  per repository, with the same structure: overview → architecture → key features →
  tech stack → local development → status & gaps.
- The **[Completeness Scorecard](/reference/completeness)** rates every repo across six
  metrics so you can see, at a glance, what is production-ready and what is still in
  flight.

::: warning Status honesty
Not everything here is finished. Pages call out in-progress work explicitly (e.g. the
`workflow` capability is hidden behind a feature flag; some send-side runtime paths are
data-layer-only). Trust the **Status & gaps** section on each page over any aspirational
prose.
:::
