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
~53 REST controllers · ~29 services · ~274 endpoint mappings · 17 Flyway migrations (V1–V17) · ~440 tests · OpenAPI at `/v3/api-docs`.
:::

## Architecture

The service is a single Spring Boot application (`LukeCoreEngineApplication`) that boots the FluxNova engine and registers the capability modules alongside it. Two concerns run in the same process and share one PostgreSQL database:

- **The engine tier** — FluxNova BPMN runtime, the Camunda REST API, identity/authorization, tenant filters, and connector plugins.
- **The capability tier** — domain modules under `com.luke.engine.capability.*` (plus top-level `form`, `document`, `emailasset`, `workflow`) that persist and serve capability data.

### Capability modules

Each module owns its own tables (Flyway-managed) and REST surface. Modules are wired in-process — there is no network hop between the engine and a capability.

| Module | Package | Responsibility |
|---|---|---|
| **form** | `capability/form`, `form` | Form definitions, versions, submissions, embed tokens, event rail, submission PDFs, outbound send; contributes to the recipient portal via `FormRecipientItemProvider` |
| **recipient** | `recipient` | Capability-agnostic recipient **portal** identity — per-tenant, account-less, authenticate-once (email/SMS-OTP + magic link), email-scoped sessions; aggregates open items across capabilities via the `RecipientItemProvider` SPI (front-end: **luke-portal**) |
| **email** | `capability/email` | Email capability data layer — sending, OTP domain verification, per-tenant Postmark server, and inbound/outbound **email boxes**. Outbound boxes get a dedicated Postmark stream; inbound mail arrives via a public webhook (`/api/public/email/inbound/{token}`), is stored, and can trigger a workflow (`email.inbound`) |
| **emailtemplate** | `capability/emailtemplate` | Bounded email-template documents / assets |
| **phone** | `capability/phone` | Vapi.ai inbound/outbound voice-call records and webhooks |
| **signature** | `capability/signature` | Native PAdES e-sign ceremonies and signed-document state |
| **document** | `document` | Tenant/capability-gated document registry (S3-backed) |
| **access** | `capability/access` | Capability access requests, orchestrated approval, and grants |
| **secrets** | `capability/secrets` | Encrypted per-tenant secret storage |
| **capability** | `capability/capability` | Capability catalog / subscription and tier gating |
| **forms — captcha** | `capability.form` | `TurnstileVerifier` — Cloudflare Turnstile on the PUBLIC embed submit surface. Platform-wide and always on, not a per-form setting. Reports VERIFIED / REJECTED / UNREACHABLE. A rejected or missing token is refused in every profile; an UNREACHABLE Cloudflare fails **open in dev/qa, closed under `prod`**. See [Bot + abuse defences](#bot-abuse-defences-on-the-public-embed-surface) |
| **forms — consent** | `capability.form` | `ConsentTerms` reads a form's required agreement from the served version's schema (`settings.consent`); `FormSubmissionService.submit` refuses (400) any submission that arrives without it and snapshots the exact wording onto the instance. Fail-closed: a door reporting no consent state, or a form enabled with blank wording, still requires agreement. See [Forms → Consent record](/capabilities/forms#consent-record-the-legally-binding-part) |
| **branding** | `branding` | Per-tenant commercial plan (`luke_tenant_plan`, FREE\|PAID — absent row = FREE) and `BrandingPolicy`, the single home for the "Developed at Lukeflow" badge rule on public form surfaces. Operator-only `PUT /api/tenants/{id}/plan` is the seam real billing will write to. See [Forms](/capabilities/forms#developed-at-lukeflow-badge) |
| **minion** | `capability/minion` | Background worker / helper tasks |
| **config** | `capability/config` | Capability-level configuration |
| **workflow** | `workflow` | WORKFLOW capability tables and integration event rail (hidden behind a launch flag) |

### Outbox / job-worker write-back

Capabilities that interact with a BPMN process do **not** call the engine directly from a request thread. Instead they use a **transactional outbox** pattern: a capability writes its state change and an outbox row in the same DB transaction, then a scheduled consumer drains the outbox and drives the corresponding process instance. Concrete instances include:

- `FormSubmissionOutbox` / `FormSubmissionOutboxConsumer` and `FormEventOutbox` — form submissions correlate into a waiting process.
- `SignatureProcessOutbox` / `SignatureProcessOutboxConsumer` + `SignatureCeremonyWriteBackDelegate` — signing ceremonies feed back into the process.
- `PhoneCallProcessOutbox` / `PhoneCallProcessOutboxConsumer` + `PhoneCallWriteBackDelegate` — call outcomes feed back.
- `AccessRequestOutbox` / `AccessRequestOutboxConsumer` — raising an access request starts its approval process (see below).
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
- **Public embed rate limiting** — the unauthenticated `/api/public/embed/**` render + submit endpoints (and the public minion proxy) are throttled per token and per source IP (429 + `Retry-After`). Per-instance in-memory by default; set `REDIS_URL` to make it a **global cross-replica** limiter (fixed-window Redis `INCR`) so horizontal scale-out can't dilute the cap. Falls back to in-memory if Redis is unset or unreachable — the limiter never blocks boot. The **source IP prefers `X-Real-Client-IP`** — the spoof-resistant value the gateway resolves and stamps (stripping any client-supplied one) — over the forgeable left-most `X-Forwarded-For`, so an abuser can't rotate XFF to mint fresh IP buckets and bypass the per-IP cap. Fully trustworthy once core's public surface is reachable only through the gateway (edge lock-down); until then it is no more forgeable than the XFF it replaces.
- **Turnstile captcha on the public embed submit** — see [Bot + abuse defences](#bot-abuse-defences-on-the-public-embed-surface) below.
- **Public-surface gateway-lock** — `PublicGatewayAuthFilter` can pin `/api/public/**`, `/embed*` and `/embed-assets/*` to **gateway-only**. All legitimate public traffic reaches core through the gateway, which stamps a shared secret as `X-Gateway-Auth` (and strips any client-supplied one); when `GATEWAY_VOUCH_SECRET` is set, the filter requires that header on those paths and **404s a direct-to-core hit** — including the raw `*.onrender.com` URL a CDN edge rule can't cover — so the `X-Real-Client-IP` above becomes fully trustworthy. **DEFAULT-OPEN** (the deliberate inverse of the fail-closed `InternalAuthFilter`): an unset secret means pass-through, so dev/qa serve embed with zero config. Arm by setting the secret on the gateway first, then the same value here.
- **Correlation IDs & health probes** — `CorrelationIdFilter` for request tracing; Spring Boot Actuator liveness/readiness endpoints for Render.
- **OpenAPI spec** — the custom `/api/**` surface is published as an OpenAPI 3 document at `/v3/api-docs` (springdoc, JSON-only), auto-derived from the controllers incl. required headers (`X-Tenant-Id`/`Authorization`) and the `{error,message,status,correlationId}` error schema, with the gateway-Bearer / operator-Basic / internal-key auth schemes documented.
- **Tuned job executor (HA)** — the FluxNova job executor is explicitly sized (`fluxnova.bpm.job-execution`, pool 5) against the Hikari pool (8) so background jobs can't starve the request path; `deployment-aware: false` for balanced multi-instance acquisition. See the `scaling-and-ha` runbook.
- **Single RBAC role catalog** — role ids, assignability, and dimension mappings live in one `RoleCatalog` the org-admin and permissions views derive from (a drift test pins them); `deployer` is documented internal-only. It also owns the **WorkOS→engine role map** (`RoleCatalog.fromWorkosSlug`): the four assignable slugs mirror the WorkOS control plane 1:1, WorkOS's built-in `member`/`admin` alias to `tenant-user`/`tenant-admin`, and an unknown or internal-only slug is denied. `POST /api/admin/onboard-user` normalizes an incoming (IdP-assigned) role through it before provisioning, so a genuinely-unknown role still fails closed. Role is set at first-touch (provisioning-default) — in-engine assignment overrides later, never re-asserted on login.
- **Named capability actions** — capability routes are gated by an action-aware level model, not just read/read-write. A route may require a named `CapabilityLevel.Action` (`READ` | `WRITE` | `PUBLISH` | `DELETE`) via `@RequiresCapabilityAction`; the interceptor resolves it from the handler, falling back to the HTTP method (GET/HEAD → READ, else → WRITE), so it only ever tightens a route. `read-write` is grandfathered to permit every action (no behaviour change), and a new **`contributor`** level grants read + ordinary edit but **not** the privileged actions — `publish`/sign-off/seal/retire (PUBLISH) and irreversible `purge` (DELETE) across FORMS/SIGNATURES/EMAIL/WORKFLOW. (#104, AC-1 of the RBAC-depth follow-up to #61.)
- **Owner implicit capability access** — a tenant **owner** (tenant-admin) implicitly holds `read-write` on every capability the tenant is subscribed to, resolved dynamically at check time (no per-capability grant admin, and it can't drift when subscriptions change). It is a *floor, not a ceiling*: an explicit per-user grant still overrides it. Non-owners are unchanged (explicit grants only). (#104 AC-2 — the tightest "owner-only" auto-access policy.)

### Access-request approval workflow

Raising an access request is orchestrated by BPMN rather than decided by a REST call.
`AccessRequestApprovalProcess` is deployed per tenant (`AccessRequestProcessDeployer`, plus
deploy-on-demand at start time so a tenant created after boot isn't stranded):

```
Access requested → [Approve access request]  (candidateGroups = ${approverGroup})
                          │
              approved ───┴─── rejected
                 │                 │
        Provision access    Return to requester
        (grant + APPROVED)         │
                 │        [Revise or withdraw]  (assignee = ${requesterId})
                End                │
                        resubmit ──┴── withdraw
                            │            │
                     Reopen request   Close request → End
                     (back to approval)
```

- **Resource owners decide.** The approval task routes to `capowner:<tenantId>:<CODE>` —
  the per-capability resource-owner group (`CapabilityOwnership`, a sibling of `TenantOwnership`
  and `CandidateGroupOwnership`). A capability with **no** owners falls back to the tenant owner
  group, so an org that configures nothing behaves exactly as before and a task can never strand.
  Owners are managed at `GET|PUT|DELETE /api/org/capabilities/{code}/owners[/{userId}]`.
- **Rejection returns, it doesn't end.** A rejected request becomes `RETURNED` and is assigned
  back to the requester, who revises the level/justification and resubmits (looping to the same
  owners, `resubmitCount` incrementing) or withdraws. `DENIED` now only arises on the legacy path.
- **Provisioning is the one write-back that must fail loudly.** `AccessProvisioningDelegate`
  grants *before* recording the decision and rethrows on failure — a process reporting "approved"
  while the member holds nothing would be a silent privilege gap — so a failure leaves a
  retryable incident with the request still `PENDING`.
- **Degraded mode is explicit.** Requests raised before this workflow, and requests whose outbox
  row hasn't drained, have no task; approve/deny then decide them inline exactly as before, and
  the consumer skips starting a process for a request that is no longer `PENDING`.
- **Authorization** — `/api/org/access-requests` admits tenant owners/operators (whole queue) and
  resource owners (only the capabilities they own). A resource owner is authorized on *owning
  something*, so an empty queue reads as an empty list rather than a 403.
- **Level-rank duplicate check** — the "you already have this" guard compares
  `CapabilityLevel.atLeast` (rank), not action classes. The previous comparison rejected every
  upgrade *through* `contributor` (a `read` holder could not request `contributor`; a
  `contributor` could not request anything).

Schema: Flyway `V18__access_request_workflow.sql` (`luke_access_request_outbox`, plus
`process_instance_id` / `resubmit_count` on `luke_capability_access_requests`).

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

## Bot + abuse defences on the public embed surface

`/api/public/embed/{token}/submit` is the only endpoint in the system that accepts writes from an
anonymous browser on somebody else's website. Five layers guard it, applied in this order — the order
is deliberate, not incidental:

| # | Layer | Why here |
| --- | --- | --- |
| 1 | **Per-IP rate limit** | Bounds ALL traffic from one source across every token, before anything else can be amplified. |
| 2 | **Token resolve** | No work happens for a forged or revoked token. |
| 3 | **Honeypot** (`Honeypot`) | A hidden field real users never fill. Silently dropped with a fake-success shape so spammers learn nothing — and, being free, it runs before anything that costs money. |
| 4 | **Turnstile captcha** (`TurnstileVerifier`) | An obvious bot has already been dropped by (3), so it never costs a Cloudflare round-trip; a flood is already bounded by (1), so the captcha cannot be used to amplify our OUTBOUND requests. |
| 5 | **Per-token rate limit → schema validation → persist** | The existing backstop, unchanged. |

### Turnstile

**Cloudflare Turnstile**, chosen because it is free with unlimited verifications, needs no Cloudflare
plan or DNS, and is GDPR-friendly. **Platform-wide and always on** — deliberately NOT a per-form
setting, so there is no schema flag and `luke-forms` is untouched.

Only the anonymous embed surface is challenged. `/api/public/form-instances/{token}/submit` (recipient
links) is already per-recipient OTP-gated and `/api/form-instances/{id}/submit` is authenticated;
adding a captcha to either would cost completion rates to re-prove something already proven.

The widget renders through the form renderer's [`beforeSubmit` slot](/libraries/forms#key-features),
so it sits **immediately above the Submit button** — with `appearance: "interaction-only"` most fillers
never see it, and the ones who do meet it where they are already looking instead of at the top of a
page they have scrolled past.

| Config | Default | Notes |
| --- | --- | --- |
| `luke.embed.captcha.enabled` | `true` | `false` bypasses the gate entirely. |
| `luke.embed.captcha.sitekey` | Cloudflare's always-pass **test** sitekey | PUBLIC. Served in the render payload. |
| `luke.embed.captcha.secret` | Cloudflare's always-pass **test** secret | SECRET. Never appears in any response or log. |
| `luke.embed.captcha.timeout-ms` | `3000` | So a hung Cloudflare cannot pin request threads. |

The defaults are Cloudflare's published **test** pair, so dev, qa and the whole test suite work with no
Cloudflare account and no network. The keys must be **paired**: a real secret rejects test tokens and a
test secret rejects real ones — set BOTH in prod, or the embed surface refuses every genuine
submission. `TurnstileVerifier` logs an error at startup if it finds a test secret under `prod`.

::: warning Fail-open in dev/qa, fail-closed under `prod`
`TurnstileVerifier` reports three outcomes, and the difference between the last two is the whole design:

- **VERIFIED** — accepted.
- **REJECTED** — Cloudflare said no, *or the client sent no token at all*. Refused with a generic 400 in
  **every** profile. Cloudflare's error codes are logged, never returned: they would tell an abuser
  which attempt is closest to working.
- **UNREACHABLE** — timeout, IO error, non-2xx, or a body we cannot parse. We have **no verdict**, which
  is not the same as a "no". This is the ONLY outcome that bends: allowed outside `prod` (a Cloudflare
  outage must not break local dev or qa), refused under it (`StrictProfile` — see [Security profiles](#security-profiles)).
:::

### CSP

The embed page's `Content-Security-Policy` previously carried only `frame-ancestors`, which left script
and frame sources **unrestricted** — CSP constrains only what you declare, and there is no
`default-src` to fall back on. It now also declares:

```
script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com
```

`'self'` covers the vendored `/embed-assets/embed.js`; the shell has no inline script, so no
`'unsafe-inline'` is granted (a test asserts both). Styles, fonts and images are deliberately left
unconstrained — the renderer legitimately loads a tenant-chosen Google font, and a blanket
`default-src` would break it for no benefit this page needs.

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

### Submission validation

Form submissions arrive through three doors — the public embed webhook, the OTP recipient portal, and the authenticated in-app fill — and all three funnel through `FormSubmissionService.submit`. The server-side backstop runs **there**, at that single choke point, rather than per-controller, so a submit path added later inherits it and cannot silently skip it.

Against the schema the instance pinned (its own version, never the definition's current one), every submission is:

| Check | Behaviour |
|---|---|
| Unknown keys | Stripped — only schema-declared fields reach process variables |
| Required fields | 400, except where the server can't know a field was shown (conditional / hidden / computed / non-persistent) |
| Declarative rules | Length, words, pattern, email/url, numeric + date/time bounds, counts, file size — mirroring `@lukeflow/form-core` |
| Option membership | Submitted choice must be one the schema declares (server-only; the browser constrains this by UI alone) |
| Size + depth | Field count, string length, collection size and nesting caps → 413 |
| Control characters | Stripped from strings and nested object keys |

Autosave uses a **draft mode** that strips and bounds but never enforces `required` or value shape — a half-filled form is the normal state of a draft, not an error.

The declarative rules exist twice: in TypeScript (browser) and Java (server). `luke-forms/fixtures/validation-parity.json` is a shared case table run against both implementations, and carries a `revision` the Java test pins so a rule changed in one language only fails at review. Expressions, author JS, and async/minion validation are **deliberately client-only** — the server never evaluates them.

See [Deployment Topology](/concepts/deployment) for how this service fits the wider fleet.

## Status & gaps

The Core Engine is **deployed and running** on dev/qa, but several items are intentionally incomplete:

- **FluxNova production DB rollout is deferred** — the migration from CIBSeven to FluxNova is validated (tests green) but the production database cutover has not been executed; prod still runs the pre-migration engine until the rollout is scheduled.
- **Production `prod` profile not yet enabled** — the fail-fast guards ship in code but require the full secret set before `postgres,prod` can be turned on. Until then they log warnings rather than blocking boot.
- **Security scans are non-gating** — the Semgrep / gitleaks / Trivy workflow runs on every PR but is `continue-on-error` by design; findings are informational until the baseline is triaged.
- **Some capabilities are data-layer-only** — certain modules persist and serve data but their end-to-end runtime (e.g. outbound send paths, WORKFLOW) is behind launch flags or not fully wired yet.

For the platform-wide readiness picture, see the [Completeness Scorecard](/reference/completeness).
