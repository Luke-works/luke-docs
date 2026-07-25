# Completeness Scorecard

Every repository rated 0–100% across six metrics plus a holistic overall, from a
July 2026 fleet audit. Use this as the honest counterweight to any aspirational prose
elsewhere in the manual.

**Metrics:** *Feature* (scope built vs intended) · *Quality* (structure/typing) ·
*Tests* (automated coverage) · *Docs* · *CI/CD* (pipeline + deploy readiness) ·
*Hardening* (auth, errors, config, validation).

## Scores (ranked)

| # | Repo | Feat | Qual | Tests | Docs | CI/CD | Hard | **Overall** | Status |
| --- | --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | --- |
| 1 | [luke-forms](/libraries/forms) | 95 | 95 | 98 | 90 | 92 | 96 | **94** | <span class="pill ready">Ready</span> |
| 2 | [luke-email](/libraries/email) | 90 | 91 | 94 | 92 | 93 | 92 | **93** | <span class="pill lib">Library</span> |
| 3 | [luke-auth-engine](/services/auth-engine) | 90 | 92 | 94 | 94 | 93 | 97 | **93** | <span class="pill ready">Ready</span> |
| 4 | [luke-agents](/services/agents) | 89 | 88 | 85 | 88 | 90 | 88 | **88** | <span class="pill ready">Ready</span> |
| 5 | [luke-core-engine](/services/core-engine) | 90 | 89 | 88 | 83 | 89 | 93 | **89** | <span class="pill partial">Partial</span> |
| 6 | [luke-platform](/operations/platform) | 88 | 88 | 82 | 90 | 85 | 91 | **88** | <span class="pill partial">Partial</span> |
| 7 | [luke-file-proxy](/services/file-proxy) | 85 | 88 | 62 | 80 | 80 | 87 | **85** | <span class="pill partial">Partial</span> |
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

**Fleet average overall ≈ 80%.**

::: tip Recent uplifts
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
an unactioned review overdue (per-tenant metric) instead of letting submissions sit forever (#46).
Hardening **91 → 93**; 386 → **433 tests**.

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
- **Testing is the most uneven axis** — elite on test-first libraries (forms 98, email /
  agents / analytics 82–85) but thin on the UIs (core-ui 48, marketing-ui 0). The extracted
  libs signatures and workflow now carry `-core` fuzz suites; their React layers remain the
  frontier. See [Testing](/operations/testing).
- **CI is now near-universal** — the last two libraries without a pipeline (signatures,
  workflow) were wired up with the same API-surface + size gates as forms/email. Only
  marketing-ui (not a git repo) and the deprecated task-engine lack CI.
- **Docs improving** — file-proxy now has a README; consumer-ui (62) is the main remaining
  under-documented large surface.

## Highest-impact fixes (remaining)

1. Test coverage on the **React layers** of luke-signatures / luke-workflow (~2k LOC each,
   hard to test under jsdom + react-pdf / react-flow) and broaden **luke-core-ui** e2e.
2. Push **luke-lists** / **luke-analytics** to GitHub (local-only today) so they get CI + the gates.
3. Decide **luke-task-engine**'s fate — archive or delete (superseded, dead weight).
4. Enable **WorkOS Directory Sync** for a pilot tenant so auth-engine's deprovisioning webhook
   can act on `dsync.*` deactivations — the only remaining piece of #38 (the `user.deleted`
   leaver loop and the central-enforcement migration of #29 both shipped).

::: info Method
Scores come from an evidence-based audit of each repo (README, build files, CI, test counts,
LOC, git recency, deploy config). They are directional engineering judgments, not a substitute
for reading the code.
:::
