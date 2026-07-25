# Core Engine

The Core Engine is Lukeflow's multi-tenant BPMN process engine — a FluxNova (FINOS Camunda-7 fork) runtime wrapped in Spring Boot, extended with an in-process capability data layer that stores and serves the domain data behind forms, email, signatures, phone, documents and more. <span class="pill partial">Partial · deployed</span>

> **Repository:** `luke-core-engine` · **Type:** Platform service · **Stack:** Java 21 / Spring Boot 3.4 / FluxNova

## Overview

`luke-core-engine` is the heart of the Lukeflow platform. It plays two roles in a single deployable:

1. **A BPMN workflow engine** — it embeds [FluxNova](https://fluxnova.finos.org/) 2.0.3 (the FINOS fork of Camunda 7) and exposes the standard Camunda REST API under `/engine-rest/**`. Customer organizations map to Camunda **tenants**; an operator "parent cluster" tenant exists for cluster managers.
2. **A capability data layer** — a set of in-process Spring modules (forms, email, signatures, phone, documents, access, secrets, and more) that own the persistent state for each Lukeflow capability. BPMN processes orchestrate these modules and write results back transactionally.

Collapsing the former standalone `luke-capability-engine` into the process engine was a deliberate architecture decision: one JVM, one database, one transaction boundary. The engine orchestrates *and* stores, which removes an entire class of cross-service consistency problems.

See [Capabilities](/concepts/capabilities), [Multi-Tenancy](/concepts/tenancy), and [Authentication & Authorization](/concepts/auth) for the platform-wide concepts this service implements.

::: info At a glance
~53 REST controllers · ~29 services · ~274 endpoint mappings · 17 Flyway migrations (V1–V17) · ~433 tests.
:::

## Architecture

The service is a single Spring Boot application (`LukeCoreEngineApplication`) that boots the FluxNova engine and registers the capability modules alongside it. Two concerns run in the same process and share one PostgreSQL database:

- **The engine tier** — FluxNova BPMN runtime, the Camunda REST API, identity/authorization, tenant filters, and connector plugins.
- **The capability tier** — domain modules under `com.luke.engine.capability.*` (plus top-level `form`, `document`, `emailasset`, `workflow`) that persist and serve capability data.

### Capability modules

Each module owns its own tables (Flyway-managed) and REST surface. Modules are wired in-process — there is no network hop between the engine and a capability.

| Module | Package | Responsibility |
|---|---|---|
| **form** | `capability/form`, `form` | Form definitions, versions, submissions, embed tokens, event rail, submission PDFs |
| **email** | `capability/email` | Email capability data layer |
| **emailtemplate** | `capability/emailtemplate` | Bounded email-template documents / assets |
| **phone** | `capability/phone` | Vapi.ai inbound/outbound voice-call records and webhooks |
| **signature** | `capability/signature` | Native PAdES e-sign ceremonies and signed-document state |
| **document** | `document` | Tenant/capability-gated document registry (S3-backed) |
| **access** | `capability/access` | Capability access requests and owner approvals |
| **secrets** | `capability/secrets` | Encrypted per-tenant secret storage |
| **capability** | `capability/capability` | Capability catalog / subscription and tier gating |
| **minion** | `capability/minion` | Background worker / helper tasks |
| **config** | `capability/config` | Capability-level configuration |
| **workflow** | `workflow` | WORKFLOW capability tables and integration event rail (hidden behind a launch flag) |

### Outbox / job-worker write-back

Capabilities that interact with a BPMN process do **not** call the engine directly from a request thread. Instead they use a **transactional outbox** pattern: a capability writes its state change and an outbox row in the same DB transaction, then a scheduled consumer drains the outbox and drives the corresponding process instance. Concrete instances include:

- `FormSubmissionOutbox` / `FormSubmissionOutboxConsumer` and `FormEventOutbox` — form submissions correlate into a waiting process.
- `SignatureProcessOutbox` / `SignatureProcessOutboxConsumer` + `SignatureCeremonyWriteBackDelegate` — signing ceremonies feed back into the process.
- `PhoneCallProcessOutbox` / `PhoneCallProcessOutboxConsumer` + `PhoneCallWriteBackDelegate` — call outcomes feed back.
- `IntegrationEventOutbox` — workflow integration events.

::: tip Why an outbox
The outbox guarantees the capability's data commit and the "notify the process engine" action are atomic. If the engine is briefly unreachable, the state is durably recorded and the consumer retries — no lost submissions, no phantom process instances. Scheduling is enabled via `AsyncSchedulingConfig`.
:::

## Key features

- **Standard Camunda REST API** — full `/engine-rest/**` surface (process definitions, instances, tasks, deployments, identity) served by FluxNova.
- **Multi-tenancy by header** — every `/engine-rest/*` request carries an `X-Tenant-Id` scope; identity/tenant-management endpoints are exempt (`TenantFilter`, `DeploymentTenantFilter`). See [Multi-Tenancy](/concepts/tenancy).
- **Authorization enabled** — the auto-seeded `camunda-admin` group holds full grants; non-admin users need explicit tenant-scoped authorizations. `RestApiAuthFilter` binds group memberships into the auth context.
- **Gateway JWT authentication** — `GatewayJwtAuthenticator` verifies short-lived JWTs signed by the consumer gateway against a configured JWKS URL (opt-in via `luke.auth.gateway.enabled`).
- **In-process capability data layer** — forms, email, signatures, phone, documents, access, secrets and more (see table above).
- **Transactional outbox write-back** — capabilities drive BPMN processes durably (see above).
- **Connectors** — FluxNova Connect (HTTP/SOAP service tasks) for BPMN service-task integration. (The JSR-223 scripting engines were removed in #22 to cut the container's off-heap footprint — no BPMN used them; re-add one engine if script tasks are ever needed.)
- **Data retention & PII expiry** — an opt-in scheduled job (`luke.retention.*`, off by default, dry-run-first) deletes/anonymizes PII trails past per-class windows: email sends, form-submission payloads, form audit events, and terminal OTP challenges. Tenant deletion cascades the same trails (right-to-erasure). See the repo's `docs/runbooks/data-retention.md`.
- **Async email delivery** — notification sends persist a `QUEUED` row and return immediately; an `@Async` after-commit dispatcher delivers off the request thread with retry-and-backoff (transient failures only — never a business rejection). Latency/outcome are on Micrometer (`luke.email.send*`). OTP stays synchronous so the code is confirmed inline.
- **Form-intake SLA & escalation** — the per-tenant intake process has a non-interrupting boundary timer on the review task: an unactioned submission is flagged overdue (metric `luke.forms.review.overdue{tenant}`) at the SLA and on recurrence, rather than sitting silently pending.
- **User lifecycle (operator + self-service)** — `POST /api/admin/onboard-user` provisions a user into a tenant/role, and `POST /api/admin/deprovision-user` revokes all of a user's access (memberships, the user, capability grants, any sole-owned tenant) — the operator/IdP counterpart to the user's own `DELETE /api/me/account`, sharing one `UserDeprovisioningService` so the cleanup can't drift. luke-auth-engine's WorkOS deprovisioning webhook calls it on IdP leaver events.
- **Fail-fast security guards** — a set of `@PostConstruct` guards refuse to boot (or warn loudly) on insecure configuration (see [Deployment](#deployment)).
- **Default-deny `/api` baseline** — a filter authenticates every `/api/**` request against an explicit allow-list (`/api/public/**`, `/api/internal/**`, `GET /api/capabilities`), so a controller added without its own auth is denied by default rather than silently open. Recognizes gateway Bearer / operator Basic / engine Basic. Opt-in (the `prod` profile or `luke.auth.api-default-deny=true`); dev/qa pass through unchanged. Defense-in-depth on top of the per-route filters (gateway/operator/internal/capability).
- **Admin audit trail** — every privileged admin mutation (user/role/candidate-group/capability changes, org creation, account & tenant deletion) writes a durable, append-only `luke_audit_event` record (actor, action, target, tenant scope, source IP/method/path, correlation id) via `AdminAuditService`. Read with `GET /api/audit` (tenant-scoped — operator or tenant owner) and `GET /api/audit/all` (operator-only, cross-tenant), newest-first and paginated. Fail-soft: a broken store degrades to a `luke.audit` log backstop and never blocks the action it records.
- **Public embed rate limiting** — the unauthenticated `/api/public/embed/**` render + submit endpoints are throttled per token and per source IP (429 + `Retry-After`). Per-instance in-memory by default; set `REDIS_URL` to make it a **global cross-replica** limiter (fixed-window Redis `INCR`) so horizontal scale-out can't dilute the cap. Falls back to in-memory if Redis is unset or unreachable — the limiter never blocks boot.
- **Correlation IDs & health probes** — `CorrelationIdFilter` for request tracing; Spring Boot Actuator liveness/readiness endpoints for Render.

## Technology

| Layer | Choice |
|---|---|
| Language | Java 21 |
| Framework | Spring Boot 3.4 (3.4.13) |
| Process engine | FluxNova 2.0.3 (FINOS Camunda-7 fork) |
| Database | PostgreSQL 16 (H2 in local dev) |
| Migrations | Flyway (V1–V13) |
| Connectors | FluxNova Connect (HTTP/SOAP) |
| Scripting | none (JSR-223 engines removed in #22; `${…}` uses the built-in JUEL) |
| Signatures | Apache PDFBox 3 + BouncyCastle (PAdES) |
| Object storage | AWS SDK v2 (S3) for document/signature stores |
| Build | Maven (wrapper `./mvnw`) |
| Container | Multi-stage Docker (JDK 21 build → JRE 21 runtime, non-root) |
| Hosting | Render (Blueprint) |

## Local development

The engine runs against an embedded H2 store by default — no external services required.

```bash
# Run with H2 (default, no setup) — boots on http://localhost:8080
./mvnw spring-boot:run

# Run with PostgreSQL (matches prod)
SPRING_PROFILES_ACTIVE=postgres \
DB_URL=jdbc:postgresql://localhost:5432/luke_camunda \
DB_USERNAME=luke DB_PASSWORD=luke \
./mvnw spring-boot:run

# Compile, run the full test suite, and package (what CI runs)
./mvnw -B -ntp verify

# Wipe and restart the dev DB
lsof -ti tcp:8080 | xargs kill 2>/dev/null
rm -rf luke-data/
./mvnw spring-boot:run
```

On a fresh database the engine seeds an `admin` user (password from `CAMUNDA_ADMIN_PASSWORD`, default `admin`), the `camunda-admin` group with full grants, and the `parent_cluster` operations tenant.

::: warning parent_cluster is not a signup default
`parent_cluster` is the operator/ops tenant used by cluster managers. End-user organizations create their own tenants via the consumer app's signup flow — never reuse the parent cluster as a customer tenant.
:::

## Deployment

The service ships as a multi-stage Docker image (JDK 21 build stage → JRE 21 runtime, running as a non-root `luke` user with a real writable home). It is deployed on [Render](https://render.com) from the `render.yaml` Blueprint (the canonical platform blueprint lives in `luke-platform`), which provisions the web service plus a managed PostgreSQL 16 instance and wires the DB connection env vars automatically. Render injects `$PORT`; the JVM is container-sized with `MaxRAMPercentage=55.0` to leave headroom for non-heap/native memory on the 512 MB starter plan (comfortably so since #22 removed the scripting engines' off-heap footprint).

Health probes: `/actuator/health/readiness` (used by Render — goes down during drain / DB loss) and `/actuator/health/liveness`.

### Security profiles

dev/qa run with `SPRING_PROFILES_ACTIVE=postgres` and default-lenient guards. Production is meant to run `postgres,prod`, where the dedicated **`prod`** profile (`StrictProfile`) flips the opt-in guards into fail-fast mode:

| Guard | Enforces |
|---|---|
| `AuthHardeningGuard` | No auth layer is left failing open |
| `InsecureKeyGuard` | No dev-default `…-change-me` secrets/HMAC keys in use |
| `AdminPasswordGuard` | Bootstrap admin password is not the default |
| `H2ConsoleGuard` | H2 console not exposed |
| `EdgeHardeningGuard` | Edge-facing hardening constraints |
| `DocumentAccessGuard` | Document-registry access scoping |

::: warning Do not add `,prod` prematurely
The `prod` profile intentionally refuses to boot if required secrets (internal shared secret, secrets master key, real embed HMAC, capability-operator credentials, gateway JWKS) are absent. Switch to `postgres,prod` only *after* every `sync:false` secret is set, or the service will (by design) fail to start.
:::

See [Deployment Topology](/concepts/deployment) for how this service fits the wider fleet.

## Status & gaps

The Core Engine is **deployed and running** on dev/qa, but several items are intentionally incomplete:

- **FluxNova production DB rollout is deferred** — the migration from CIBSeven to FluxNova is validated (tests green) but the production database cutover has not been executed; prod still runs the pre-migration engine until the rollout is scheduled.
- **Production `prod` profile not yet enabled** — the fail-fast guards ship in code but require the full secret set before `postgres,prod` can be turned on. Until then they log warnings rather than blocking boot.
- **Security scans are non-gating** — the Semgrep / gitleaks / Trivy workflow runs on every PR but is `continue-on-error` by design; findings are informational until the baseline is triaged.
- **Some capabilities are data-layer-only** — certain modules persist and serve data but their end-to-end runtime (e.g. outbound send paths, WORKFLOW) is behind launch flags or not fully wired yet.

For the platform-wide readiness picture, see the [Completeness Scorecard](/reference/completeness).
