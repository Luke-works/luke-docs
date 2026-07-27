# Completeness Scorecard

Every repository rated 0–100% across six metrics plus a holistic overall, from a
July 2026 fleet audit. Use this as the honest counterweight to any aspirational prose
elsewhere in the manual.

**Metrics:** *Feature* (scope built vs intended) · *Quality* (structure/typing) ·
*Tests* (automated coverage) · *Docs* · *CI/CD* (pipeline + deploy readiness) ·
*Hardening* (auth, errors, config, validation).

## MVP readiness (read this first)

::: warning Scope is locked
**MVP = Forms · Email · Access. Nothing else.** Phone, Workflow, Documents and Signatures are
**post-MVP** — deliberately deferred, **not gaps** against the MVP. They must not be counted
against readiness, and they are now **hidden from the shipped UI** by default (each behind its own
`VITE_PHONE_ENABLED` / `VITE_SIGNATURES_ENABLED` / `VITE_WORKFLOW_ENABLED` flag; Documents has no
UI surface). The per-repo scores further down are the *full-fleet* view — a repo marked "Partial"
there is often only partial because of post-MVP capabilities that are out of scope here.
:::

The three MVP pillars, judged only on what the MVP needs:

| Pillar | Backing | MVP verdict |
| --- | --- | --- |
| **Forms** | [luke-forms](/libraries/forms) 94 (Ready) · core-engine forms data-layer + design-time lifecycle · [consumer-ui](/apps/consumer-ui) builder/renderer | <span class="pill ready">Ready</span> — headless engine is the fleet's strongest repo; builder cut over; embed + submissions shipped. |
| **Email** | [luke-email](/libraries/email) 93 · core-engine email data-layer + async delivery (retry/backoff/metrics) · Postmark send as a Camunda task | <span class="pill ready">Ready</span> — headless template engine + hardened outbound; no known MVP-blocking gap. |
| **Access** | core-engine **RBAC/ABAC** (RoleCatalog SSOT, named actions, capability grants, owner-implicit access, tenant fail-closed, durable audit) · [auth-engine](/services/auth-engine) 93 (Ready) authentication · consumer-ui access UI (contributor level) | <span class="pill ready">Ready</span> — authorization owned + enforced by the engine; WorkOS is auth-only. RBAC depth complete (#104 closed; AC-1/AC-2 shipped, AC-3 = optional dsync convenience externalized to #105). |

**Authorization ownership (locked):** RBAC **and** ABAC are owned and enforced by **core-engine**;
**WorkOS is authentication only**; auth-engine is a stateless translator. A WorkOS org therefore
does **not** need to sync with the engine's RBAC — SSO/SCIM org→tenant auto-provisioning is a
*provisioning convenience* ([#105](https://github.com/Luke-works/luke-core-engine/issues/105),
low/deferred), never an authz gap.

**MVP-blocking remaining** (small, and none are new features):
1. **FluxNova prod migration** — the CIBSeven→FluxNova cutover is green on its branch but **not yet
   rolled to prod** (see [migration notes](/services/core-engine)). This is the one infra step
   between "built" and "MVP-live".
2. **Validate sign-off** — the recent RBAC/hardening batch sits in *Validate*; final review → Done.
3. **consumer-ui docs** (62) — the largest under-documented MVP surface; a quality nicety, not a blocker.

*Post-MVP, tracked but off the MVP path:* Phone (Vapi voice), Workflow (luke-workflow lib is
pre-launch + UI-hidden), Documents (S3 object-storage plan, backlog-only), Signatures
(luke-signatures lib is a library + UI-hidden). The external-task/topic registry that used to sit
in the engine is **retired** ([#45](https://github.com/Luke-works/luke-core-engine/issues/45)),
externalized to the standalone luke-tasks / TLM product.

## Scores (ranked)

| # | Repo | Feat | Qual | Tests | Docs | CI/CD | Hard | **Overall** | Status |
| --- | --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | --- |
| 1 | [luke-forms](/libraries/forms) | 95 | 95 | 98 | 90 | 92 | 96 | **94** | <span class="pill ready">Ready</span> |
| 2 | [luke-email](/libraries/email) | 90 | 91 | 94 | 92 | 93 | 92 | **93** | <span class="pill lib">Library</span> |
| 3 | [luke-auth-engine](/services/auth-engine) | 90 | 92 | 94 | 94 | 93 | 97 | **93** | <span class="pill ready">Ready</span> |
| 4 | [luke-agents](/services/agents) | 91 | 90 | 93 | 91 | 92 | 93 | **92** | <span class="pill ready">Ready</span> |
| 5 | [luke-core-engine](/services/core-engine) | 90 | 89 | 90 | 85 | 89 | 94 | **90** | <span class="pill partial">Partial</span> |
| 6 | [luke-platform](/operations/platform) | 88 | 88 | 82 | 90 | 85 | 91 | **88** | <span class="pill partial">Partial</span> |
| 7 | [luke-file-proxy](/services/file-proxy) | 85 | 88 | 66 | 80 | 80 | 90 | **86** | <span class="pill partial">Partial</span> |
| 8 | [luke-consumer-ui](/apps/consumer-ui) | 88 | 85 | 85 | 62 | 90 | 80 | **84** | <span class="pill partial">Partial</span> |
| 9 | [luke-signatures](/libraries/signatures) | 85 | 88 | 62 | 90 | 85 | 78 | **81** | <span class="pill lib">Library</span> |
| 10 | [luke-workflow](/libraries/workflow) | 72 | 87 | 82 | 85 | 85 | 76 | **81** | <span class="pill exp">Pre-launch</span> |
| 11 | [luke-api-collection](/operations/api-collection) | 85 | 88 | 40 | 90 | 5 | 90 | **77** | <span class="pill partial">Partial</span> |
| 12 | [luke-analytics](/libraries/analytics) | 70 | 88 | 82 | 85 | 78 | 55 | **76** | <span class="pill lib">Library</span> |
| 13 | [luke-core-ui](/apps/core-ui) | 90 | 72 | 48 | 78 | 80 | 80 | **76** | <span class="pill partial">Partial</span> |
| 14 | [luke-lists](/libraries/lists) | 70 | 85 | 70 | 73 | 78 | 78 | **74** | <span class="pill lib">Library</span> |
| 15 | [luke-marketing-ui](/apps/marketing-ui) | 87 | 85 | 0 | 78 | 5 | 45 | **66** | <span class="pill exp">Stale</span> |
| 16 | luke-task-engine | 58 | 72 | 8 | 65 | 5 | 35 | **41** | <span class="pill exp">Experimental</span> |

*Not scored: `luke-capability-engine`, `luke-signature-engine` — empty shells merged into
[core-engine](/services/core-engine).*

**Fleet average overall ≈ 81%.**

::: tip Recent uplifts
A **fleet-wide autonomous hardening pass** (2026-07-25) audited all MVP-critical repos and shipped a
safe, CI-green fix to **seven** of them in one sweep — security and reliability, each with tests:

- **[luke-auth-engine](/services/auth-engine)** — the reverse proxy now routes every error through the
  RFC 7807 boundary (a hostile `X-Tenant-Id` could previously break the JSON body), exposes the
  correlation-id / download headers cross-origin, and has typed connect/request timeouts that surface a
  slow engine as **504** (not a mislabeled 502).
- **[luke-email](/libraries/email)** — `validateEmailDoc` now **blocks Mustachio raw-output/section
  syntax** (`{{{x}}}`, `{{&x}}`, `{{#s}}…{{/s}}`), which would otherwise inject unescaped markup into the
  *delivered* email (the escaping contract only covered `{{var}}`).
- **[luke-file-proxy](/services/file-proxy)** — closed an **SSRF** in the Chromium PDF render (user form
  data/theme could make the browser GET a cloud-metadata endpoint) via deny-by-default egress with a
  font-host allowlist, and added the first tests to the previously-uncovered render path.
- **[luke-agents](/services/agents)** — brain errors no longer **leak the raw provider exception** (and a
  circuit-open 503 is preserved, not flattened to 502); Prometheus route labels use the matched template
  so unmatched paths can't explode metric cardinality. A **cost-control trio** then closed the AI-spend
  gap end-to-end: **spoof-resistant client-IP** for the rate-limit key (real client = 2nd `X-Forwarded-For`
  from the right, Cloudflare+Render verified — a rotated leftmost XFF can no longer mint fresh budget);
  **token metering** (`agents_llm_tokens_total` + `llm.last_usage()`) that finally makes the fleet's
  primary cost visible; and a **per-tenant daily token cap** on top of the rate limit, so a tenant spread
  across many IPs/user_ids can't run up unbounded spend (off unless armed, ~$9/mo/tenant at the suggested
  1M/day). Tier-aware limits + durable per-tenant token history are the deliberate next layer (billing).
- **[luke-consumer-ui](/apps/consumer-ui)** — token refresh is now **single-flight** (parallel 401s no
  longer stampede `/auth/refresh` and rotate the cookie N times), and every auth/core fetch has a 30s
  timeout so a hung gateway can't spin the UI forever.
- **[luke-core-engine](/services/core-engine)** — the form-submission outbox now **auto-retries** a
  transient start failure (bounded budget) instead of terminally stranding an MVP intake on the first
  blip, and the **recipient OTP token secret** is now in the prod fail-fast key guard (the dev default
  would let anyone forge a post-OTP token). The public embed/minion rate limiters now key off a
  **gateway-vouched `X-Real-Client-IP`** instead of a forgeable left-most `X-Forwarded-For`: the gateway
  resolves the true client IP (trusted-proxy-hops from the right) and stamps it, stripping any
  client-supplied one — so an abuser can no longer rotate XFF to mint fresh IP buckets. Fully closed once
  core's public surface is reachable only through the gateway (**edge lock-down — an operator infra step**);
  until then it's no more forgeable than before, and the honest gateway path is already hardened.
- **[luke-forms](/libraries/forms)** — a file field only renders a clickable link for a **safe URL
  scheme**, closing a stored-XSS vector where a prefilled `javascript:` file value became a working link.

One audit item remains queued for a decision (an auth-engine proxy circuit-breaker); the agents
rate-limit trusted-proxy-hop count has since been resolved (verified 2 hops = Cloudflare + Render).
The rest of the audit backlog is tracked for follow-up.

The prior pass lifted **[luke-agents](/services/agents)** 88 → **92** (now #4) — twelve issues
clearing its enterprise backlog end-to-end, top severity down. A **durable transcript write path**
(an off-request-path retrying queue with a configurable pool, a graceful-shutdown flush, and drop
counters) closed a silent data-loss hole where turns vanished on redeploy or pool exhaustion
(#41/#30/#28), and a prod guard now refuses to record to ephemeral JSONL. **Alembic-managed schema
migrations** run as a pre-deploy step, validated by a real-Postgres CI job (#31). An **append-only
audit trail** records exports and label-changes against the *verified* principal (never a
client-supplied field), with an **operator-token gate** on the corpus export (#40). A
**liveness/readiness split** (`/health` can't-fail vs a 503-capable `/health/ready` dependency
probe) runs on a modern lifespan replacing the deprecated `on_event` hooks (#35/#36). The LLM path
gained **transient-retry + a per-brain circuit breaker** and **reused provider clients** (#24/#25),
a **Prometheus `/metrics`** endpoint surfaces request volume/latency + transcript counters (#22),
and the API is now **versioned under `/v1` with a curated OpenAPI** (X-Agents-Key security scheme,
app v1.0.0) while legacy paths stay for drop-in clients (#37). Tests **91 → 129**; Hardening
**88 → 93**, Tests **85 → 93**, Docs/CI/CD/Feature/Quality each +2–3.

A follow-on **RBAC pass** lifted **[luke-core-engine](/services/core-engine)** 89 → **90**: the
WorkOS→engine role map (`RoleCatalog.fromWorkosSlug`, mirrored 1:1 in the WorkOS control plane)
provisions IdP-assigned roles at onboarding, fail-closed on unknown (#61); **finer-grained named
capability actions** gate publish/sign-off/delete separately from ordinary write, with a new
`contributor` level (edit-but-not-publish/delete) and **owner-implicit capability access**;
[consumer-ui](/apps/consumer-ui) surfaces the `contributor` grant in its access UI (#46).
**#104 is now closed** — the RBAC-depth core (named actions + role→capability auto-grants, AC-1/AC-2)
shipped, and AC-3 (SSO/dsync org→tenant auto-provisioning) was **externalized as optional #105**
because authorization is engine-owned and does not depend on WorkOS org sync. The stale
external-task/topic registry (#45) was **retired** in the same pass (externalized to luke-tasks/TLM).
440 → **460 tests**, Hardening 93 → **94**.

Two successive passes lifted auth-engine 88 → **93** (now tied for #2). A second,
"path-to-best-in-fleet" pass added: a shared **Redis rate limiter** (global cross-replica cap,
in-memory fallback) closing the per-instance limit gap (#56); a real **end-to-end JWKS
verification** test (signed token → NimbusJwtDecoder → filter → chain, no live WorkOS) that also
**caught and fixed a latent proxy bug** — the `Upgrade` header 500'd every request from a client
that sent it (#57); a **typed ratelimit config** consolidation (#58); and a machine-readable
**OpenAPI** doc at `/v3/api-docs` (#59). Hardening **95 → 97**, Tests **90 → 94** (134 tests),
Docs **91 → 94**.

The first, eight-issue pass lifted it 88 → **91**, touching every axis:

- **[luke-auth-engine](/services/auth-engine)** 88 → **91** —
  a sanitized RFC 7807 error boundary that stops raw upstream/exception detail (internal URIs,
  signing-key internals) reaching clients (#37); typed `@Validated` config with a comprehensive
  prod fail-fast guard — WorkOS creds, strict validation, stable key, non-local CORS,
  dev-mode-off (#35); a full docs refresh — README rewrite plus `API.md` / `CONFIGURATION.md` /
  `ERRORS.md` / `SUPPLY-CHAIN.md` / `DEPROVISIONING.md`, retiring the stale-Clerk gap (#28);
  a **supply-chain gate** — digest-pinned bases, per-build CycloneDX SBOM, a gating Trivy image
  scan and Dependabot, which caught real CRITICAL RCEs and drove a Spring Boot 3.4.13→3.5.16 bump
  off the EOL line (#41); session-cache **single-flight** against upstream stampedes (#34);
  a **liveness/readiness split** with dependency probes + graceful drain, health-checked on
  liveness so a downstream blip can't restart the gateway (#26); a central `SecurityFilterChain`
  that is **authenticated-by-default** behind a canonicalization-aware allowlist, with a WorkOS
  auth filter + consistent security headers (#29); and a signature-verified **WorkOS
  deprovisioning webhook** that, on `user.deleted`, invalidates the cached session *and* removes
  the engine membership via a new core-engine operator endpoint (#38 — only Directory-Sync
  mapping remains). Tests **75 → 120**. CI/CD **85 → 90**, Hardening **92 → 95**, Docs
  **82 → 91**, Tests **85 → 90**.

An in-flight **[luke-core-engine](/services/core-engine)** hardening pass (ongoing) has so far
shipped: a **global exception handler** giving `/api/**` one `{error,message,status,correlationId}`
shape across controllers *and* the auth filters — also closing a JSON-injection hole where a raw
`X-Tenant-Id` was concatenated into a response body (#63); **tenant fail-closed** — the Hibernate
tenant filter now matches nothing (not every row) when no tenant is in context, and the entity
listener throws instead of persisting untenanted (#21); a **rate limit on the public embed GET
render** that was previously unbounded, with `Retry-After`, then a **shared cross-replica limiter**
(Redis fixed-window `INCR` behind `REDIS_URL`, in-memory fallback) so horizontal scale-out can't
dilute the cap (#55); and a **durable, append-only admin audit trail** — every privileged
user/role/capability/tenant mutation writes a `luke_audit_event` record
(actor/action/target/tenant/source), operator- and owner-queryable, fail-soft to a `luke.audit` log
backstop (#37); and a **default-deny `/api` baseline** (prod-/flag-gated) that closed **three
previously-unguarded routes** reachable with only a spoofable `X-Tenant-Id` (`/api/email-boxes`,
`/api/minions`, `/api/my-subscriptions`), denies any future un-authed `/api` controller by default,
and consolidates all credential parsing into one shared `ApiCallerResolver` the seven self-auth
controllers now delegate to (#20 — all ACs done); a **memory fix** removing the unused GraalVM
JS/Jython/Groovy scripting engines that were OOM-pressuring the 512 MB starter plan (#22); and a
**data-retention / PII-expiry** job (opt-in, dry-run-first) that deletes/anonymizes email sends,
form-submission payloads, form audit events and terminal OTP challenges past per-class windows, with
tenant deletion cascading the same trails for right-to-erasure (#53); **async email delivery** with
retry-and-backoff + Micrometer metrics that stops tying serving threads to Postmark latency (OTP kept
synchronous) (#59); and a **form-intake SLA + escalation** — a non-interrupting boundary timer flags
an unactioned review overdue (per-tenant metric) instead of letting submissions sit forever (#46); a
single **`RoleCatalog`** the org-admin + permissions views derive from (drift-tested), resolving the
`deployer` inconsistency (#43); an explicitly **tuned, HA-safe job executor** sized against the DB
pool (#28); and an **OpenAPI 3 spec** of the `/api/**` surface at `/v3/api-docs` (#35). Hardening
**91 → 93**, Docs **83 → 85**; 386 → **440 tests** (12 issues cleared this cycle).

An earlier hardening pass lifted four components toward production-ready:

- **[luke-email](/libraries/email)** 87 → **93** — public-API-surface guard + size budget in CI,
  property/fuzz + injection-safety tests (`email-core` 39 → 66 tests), full docs suite. Now #2.
- **[luke-signatures](/libraries/signatures)** 72 → **81** — added CI (it had none) + the
  API-surface/size gates, `sign-core` fuzz/edge tests, and `SECURITY.md` / `docs/USAGE.md`.
- **[luke-workflow](/libraries/workflow)** 67 → **81** — added CI + gates + `workflow-core`
  property/fuzz tests + docs, and fixed a clean-checkout build-order bug + latent typecheck errors
  that had no CI to catch them.
- **[luke-file-proxy](/services/file-proxy)** 82 → **85** — added a comprehensive README (it had
  only a design charter).

Every one is **CI-green**. The two library uplifts brought signatures and workflow up to the same
enforceable gates as forms/email.
:::

## Tiers

- **Production-grade (85–94):** forms, email, agents, auth-engine, core-engine, platform, file-proxy.
- **Solid, partial (76–84):** consumer-ui, signatures, workflow, api-collection, analytics, core-ui.
- **Emerging (74):** lists.
- **Stale / experimental:** marketing-ui (66), task-engine (41) — the latter superseded by the engine's outbox/job-worker model.

## Cross-fleet patterns

- **Hardening is a fleet-wide strength** — 85+ on every shipped service (fail-fast guards,
  tenant isolation, supply-chain scans). See [Security](/operations/security).
- **Testing is the most uneven axis** — elite on the test-first services (forms 98, email 94,
  agents 93) but thin on the UIs (core-ui 48, marketing-ui 0). The extracted
  libs signatures and workflow now carry `-core` fuzz suites; their React layers remain the
  frontier. See [Testing](/operations/testing).
- **CI is now near-universal** — the last two libraries without a pipeline (signatures,
  workflow) were wired up with the same API-surface + size gates as forms/email. Only
  marketing-ui (not a git repo) and the deprecated task-engine lack CI.
- **Docs improving** — file-proxy now has a README; consumer-ui (62) is the main remaining
  under-documented large surface.

## Highest-impact fixes (remaining)

*Fleet-wide list — none of these are MVP-blocking. The only work between the MVP surface and
"live" is the [FluxNova prod migration + Validate sign-off](#mvp-readiness-read-this-first) above;
everything below is post-MVP polish or targets deferred capabilities.*

1. Test coverage on the **React layers** of luke-signatures / luke-workflow (~2k LOC each,
   hard to test under jsdom + react-pdf / react-flow) and broaden **luke-core-ui** e2e.
2. Push **luke-lists** / **luke-analytics** to GitHub (local-only today) so they get CI + the gates.
3. Retire **luke-task-engine** — confirmed superseded by the engine's outbox/job-worker model and
   dropped from the active roadmap; archive or delete the repo (and its core-ui external-tasks UI).
4. Enable **WorkOS Directory Sync** for a pilot tenant so auth-engine's deprovisioning webhook
   can act on `dsync.*` deactivations — the only remaining piece of #38 (the `user.deleted`
   leaver loop and the central-enforcement migration of #29 both shipped).

::: info Method
Scores come from an evidence-based audit of each repo (README, build files, CI, test counts,
LOC, git recency, deploy config). They are directional engineering judgments, not a substitute
for reading the code.
:::
