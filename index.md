---
layout: home

hero:
  name: Lukeflow
  text: Platform Manual
  tagline: A multi-tenant BPMN process engine and its capability fleet — forms, email, signatures, phone, documents, access and workflow — documented end to end.
  actions:
    - theme: brand
      text: Introduction
      link: /guide/introduction
    - theme: alt
      text: Architecture
      link: /guide/architecture
    - theme: alt
      text: The Fleet
      link: /guide/fleet-map

features:
  - title: Platform Services
    details: The Java/Spring core engine (FluxNova — a Camunda-7 fork), the WorkOS↔engine auth gateway, the S3 file/PDF proxy, and the FastAPI AI-agent fleet.
    link: /services/core-engine
    linkText: Core Engine, Auth, File Proxy, Agents
  - title: Applications
    details: The consumer orchestrator UI, the operator cockpit (Camunda-cockpit-style ops console), and the public marketing site.
    link: /apps/consumer-ui
    linkText: Consumer UI, Core UI, Marketing
  - title: Headless Libraries
    details: Framework-agnostic engines vendored into the apps — Forms, Email, Signatures, Lists, Analytics and Workflow — each a core + React + builder monorepo.
    link: /libraries/forms
    linkText: Forms, Email, Signatures, Lists…
  - title: Capabilities
    details: The domain features tenants subscribe to — how forms, email, e-signature, phone (Vapi), documents, access requests and calendars/SLA fit together.
    link: /concepts/capabilities
    linkText: Capability model
  - title: Operations
    details: The Render deployment blueprint, the fleet-wide security program, the testing strategy, and the Postman API collection.
    link: /operations/platform
    linkText: Deploy, test, secure
  - title: Reference
    details: A completeness scorecard rating every repo across six metrics, plus a glossary of Lukeflow terms.
    link: /reference/completeness
    linkText: Scorecard & glossary
---

## About this manual

This is the engineering manual for **Lukeflow** — the platform behind the `luke-*`
repositories. It is written in the spirit of the **Camunda 7 manual**: a wiki-style
reference with a section tree on the left, prose and reference tables in the middle,
and an *On this page* outline on the right.

The platform is built around a **multi-tenant BPMN process engine** (`luke-core-engine`,
a fork of the FINOS FluxNova / Camunda-7 engine) that also hosts an in-process
**capability data layer**. Everything else — the UIs, the headless authoring libraries,
the auth gateway, the file proxy and the AI agents — orbits that core.

::: tip Documentation snapshot
This manual reflects the state of the fleet **as of July 2026**. Where a component is
still in progress, the page says so explicitly and links to the relevant gaps in the
[Completeness Scorecard](/reference/completeness).
:::
