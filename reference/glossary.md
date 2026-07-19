# Glossary

Terms used throughout this manual.

## Platform terms

**Capability** — A domain feature a tenant subscribes to and a BPMN process invokes (forms,
email, signatures, phone, documents, access, calendars, workflow). Runs *in-process* in the
engine. See [Capabilities](/concepts/capabilities).

**Capability data layer** — The set of engine modules that persist a capability's own tables
(definitions, versions, instances) beside the process engine, rather than in a separate service.

**Outbox / job-worker** — Camunda's transactional mechanism the engine uses to write a
capability side-effect back in the same transaction that advances the process, avoiding
dual-write inconsistency.

**Capability→core merge** — The decision to collapse standalone capability services into the
engine's in-process data layer. Left `luke-capability-engine` and `luke-signature-engine` as
empty shells.

**FluxNova** — The FINOS fork of the Camunda-7 process engine that `luke-core-engine` runs on
(migrated from CIBSeven). BPMN behavior is Camunda-7-compatible.

**Tenant** — An isolated customer organization. All process and capability data is
tenant-scoped. See [Multi-Tenancy](/concepts/tenancy).

**`owner:<tenantId>` group** — The scoped group modeling tenant ownership; fixes cross-tenant
org-admin escalation. Transferable.

## Auth terms

**WorkOS** — The hosted authentication provider (the front door), migrated off Clerk. Issues
the session JWT the fleet trusts. See [Authentication & Authorization](/concepts/auth).

**Auth Engine / gateway** — `luke-auth-engine`, the stateless translator that verifies a
WorkOS JWT and mints a short-lived **act-as-user** token for the engine. Holds no database.

**Act-as-user token** — The short-lived RS256 token the gateway mints and the engine trusts,
carrying the user + tenant context.

**HMAC embed token** — The unguessable bearer token that authenticates the public embeddable
forms surface (`/embed`, `/api/public/**`).

## Application & library terms

**Consumer UI** — `luke-consumer-ui`, the tenant-facing orchestrator application.

**Core UI / Cockpit** — `luke-core-ui`, the operator ops console (Camunda-Cockpit-style).

**Headless library** — A framework-agnostic TypeScript engine (`core`) plus a React renderer
(`react`) and a visual designer (`builder`), tested in isolation. E.g. `luke-forms`,
`luke-email`. See [Forms](/libraries/forms).

**Vendored dist** — The build artifact of a headless library, **copied** into an app under
`vendor/@lukeflow/<pkg>/` rather than installed from npm. The apps consume libraries this way.

**EmailDoc** — The bounded, closed-vocabulary document model at the heart of `luke-email`
(heading / text / button / image / divider / spacer / footer blocks + theme + variables).

**Variable contract** — The typed variable model an email/form template exposes, with defaults
and preview values, so a template's inputs are known and validated.

**Form kind** — Whether a form is **inbound** (embeddable, gated on submission handling) or
**outbound** (prefill + send, per-field preparer/recipient roles, never embeddable).

## Operations terms

**Render Blueprint** — The `render.yaml` in `luke-platform` that declaratively deploys the
whole non-production fleet. See [Deployment Topology](/concepts/deployment).

**Schema isolation** — Per-environment `schema-name` + `table-prefix` on the shared PostgreSQL
so dev/qa/uat coexist without colliding on Camunda's identity tables.

**Strict / prod profile** — A dedicated Spring profile that activates the engine's fail-fast
security guards, distinct from the `postgres` profile dev/qa run on.

**PAdES** — The PDF Advanced Electronic Signatures standard the native e-signing implements
(PDFBox + BouncyCastle), engine-side — not in `luke-signatures`.

**Vapi** — The third-party AI voice-call provider behind the phone capability.

## See also

- [Introduction](/guide/introduction) · [Architecture](/guide/architecture) ·
  [The Fleet](/guide/fleet-map) · [Completeness Scorecard](/reference/completeness)
