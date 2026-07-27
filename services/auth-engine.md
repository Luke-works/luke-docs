# Auth Engine

The Auth Engine is Lukeflow's consumer-facing **authentication gateway**. It sits in the request path between `luke-consumer-ui` and [Core Engine](/services/core-engine): it verifies the caller's WorkOS token, mints a short-lived signed *act-as-user* token, and transparently reverse-proxies the request upstream — where the real authorization happens.

<span class="pill ready">Production-ready · deployed</span>

> **Repository:** `luke-auth-engine` · **Type:** Platform service · **Stack:** Java 21 / Spring Boot 3.4

## Overview

The Auth Engine solves one problem: keep the powerful *act-as-user* token out of the browser. The only credential a browser ever holds is its own WorkOS session token. Because the gateway is on the path for every request, it can exchange that browser token for an internal, short-lived RS256 token that vouches for the user to the engine — and that internal token never leaves the server-to-server hop.

It is a **stateless translator**. It holds **no database** and stores no session or user state of its own; all identity truth lives in WorkOS (authentication) and Core Engine (users, tenants, groups, and authorization). The gateway only verifies, mints, and forwards.

Its responsibilities are deliberately narrow:

- **Authenticate** the caller by verifying their WorkOS access token (JWKS, strict issuer/audience, fail-closed).
- **Run the login flows** server-to-server against the WorkOS User Management API (`/auth/login`, `/auth/register`, `/auth/callback`, social/SSO, refresh, logout).
- **Mint** a short-lived signed act-as-user token (RS256, ~60s TTL, minted fresh per request).
- **Proxy** the request verbatim to Core Engine (and, for the DOCUMENTS byte tier, optionally to `luke-file-proxy`).

::: info Where authorization happens
The Auth Engine authenticates; it does **not** authorize. Core Engine verifies the gateway's token against its published JWKS and enforces the user's tenant/group permissions. See [Authentication & Authorization](/concepts/auth) for the full model.
:::

`luke-core-ui` (the operator console) talks to the engine directly over HTTP Basic and does **not** pass through this service.

## Architecture

The gateway performs a **verify → mint → proxy** exchange on every request. It parses no request bodies — Spring's multipart resolver is disabled so file uploads stream through untouched (Content-Type and boundary preserved), reaching the engine or file-proxy verbatim.

```
consumer-ui --WorkOS access token--> luke-auth-engine --act-as-user JWT--> luke-core-engine
                                            |                                     ^
                                    verify WorkOS (JWKS)                  verify gateway (JWKS)
                                    mint signed RS256 token               setAuthentication(user)
```

| Step | What happens | Enforced by |
|------|--------------|-------------|
| 1. Verify | The incoming WorkOS access token is validated against WorkOS's JWKS. In prod, issuer + audience are required and any mismatch **fails closed** (all tokens rejected) rather than accepting expiry-only. | `WorkosTokenVerifier`, `AuthHardeningGuard` |
| 2. Resolve | The verified WorkOS subject is resolved to an engine `userId`. Service accounts (robots) instead present `X-Service-Key` at `/service/token`. | `IdentityResolver`, `ServiceKeyRegistry` |
| 3. Mint | A short-lived RS256 act-as-user token (issuer `luke-auth-engine`, audience `luke-core-engine`, ~60s TTL) is signed with the gateway's private key. | `GatewayKeys`, `SessionService` |
| 4. Proxy | The request is forwarded transparently to Core Engine (or file-proxy for `/api/documents/**` byte operations), carrying the minted token and a correlation id. | `EngineProxyController` |
| 5. Publish | The gateway exposes its signing key(s) at `/.well-known/jwks.json` so the engine can verify minted tokens; rotation overlaps old + new `kid`. | `JwksController` |

The act-as-user token is **stateless and per-request** — there is nothing to store, so a restart or a second instance behaves identically (modulo the in-memory rate-limit counters noted below).

## Key features

Hardening is layered so dev/qa stay lenient while prod fails fast on any missing guard:

- **`DevModeGuard`** — dev-mode (the `X-Dev-User` header / `/dev/token` backdoor) requires the `dev` Spring profile. The app refuses to boot if dev-mode is on without it, so a single stray env var can't open the backdoor in prod.
- **`AuthHardeningGuard`** — under the `prod` profile (or `luke.auth.require-hardened=true`) the app refuses to start unless **all** production invariants hold: WorkOS credentials present, strict WorkOS validation on (with issuer + audience), a stable signing key, non-localhost/non-wildcard CORS, and dev-mode off. dev/qa without the profile stay lenient.
- **Typed, validated config** — every `luke.auth.*` / `luke.cors.*` setting binds to `@Validated` `@ConfigurationProperties` (`LukeAuthProperties`, `LukeCorsProperties`), the single source of truth the guard reads. `docs/CONFIGURATION.md` lists every setting, default, and prod requirement.
- **Sanitized error boundary** — one `@RestControllerAdvice` maps every exception to an RFC 7807 `application/problem+json` body (with legacy `error`/`message` keys the UI reads) and a correlation id. Internal detail — upstream URIs, hostnames, stack messages, signing-key internals — is logged, never returned; WorkOS's own user-facing 4xx text passes through. See `docs/ERRORS.md`.
- **Require-stable-key prod guard** — `GATEWAY_REQUIRE_STABLE_KEY=true` forbids the ephemeral-key fallback, so a prod restart never silently rotates the engine's trust anchor.
- **Per-IP rate limiting** — a fixed-window limiter over the credential/token endpoints (`/auth/login`, `/auth/register`, `/auth/password`, `/service/token`), keyed by client IP + path. Set `REDIS_URL` to enforce the limit **globally across replicas** (shared Redis store); unset ⇒ in-memory per-instance, and a Redis blip degrades to in-memory rather than failing.
- **Correlation-id filter** — tags every log line (MDC `correlationId`) and forwards the id to Core Engine so a trace spans the gateway hop.
- **Audit logger** — privileged/auth events on a dedicated `luke.audit` logger, always emitted at INFO for a filterable trail.
- **Service-key hashing + live revocation** — service keys may be stored SHA-256-hashed at rest, carry `;exp=` self-expiry and `;scope=` metadata, and be revoked live via `POST /service/keys/{keyId}/revoke` with an operator token (no redeploy).
- **XFF trusted-proxy-hops** — client IP is resolved from `X-Forwarded-For` honoring a configured number of trusted reverse-proxy hops (Cloudflare + Render = 2), so a spoofed prepended header can't fool the rate limiter or audit source IP. The gateway also **vouches that resolved IP to Core Engine** as `X-Real-Client-IP` on every proxied request (and strips any client-supplied `X-Real-Client-IP` first — the gateway is the sole asserter, exactly as for `X-User-Id`), so core's public embed/minion limiters can key off a trustworthy client IP instead of a forgeable left-most XFF hop. When `GATEWAY_VOUCH_SECRET` is set, the gateway also stamps that shared secret as `X-Gateway-Auth` (proof-of-origin, likewise stripped-then-asserted) so core can **lock its public surface to gateway-only** — rejecting a direct-to-core hit that a CDN edge rule can't reach. Unset ⇒ not stamped (feature off).
- **Key rotation with overlap** — a previous public key can be published in the JWKS alongside the current one, so tokens signed by either `kid` verify during a zero-downtime rotation window (see `docs/key-rotation.md`).
- **Authenticated-by-default** — one `SecurityFilterChain` requires authentication for every request except an explicit, canonicalization-aware public allowlist, so a new endpoint is protected even if its author forgets a check. A `WorkosAuthenticationFilter` verifies the WorkOS Bearer (and dev-mode `X-Dev-User`) into the security context. It also applies consistent security headers (`X-Content-Type-Options: nosniff`, HSTS, `Referrer-Policy: no-referrer`); frame-options are deliberately left off so the public embed page stays iframable under its per-tenant `frame-ancestors` CSP.
- **Liveness/readiness split** — `/actuator/health/liveness` reflects only "is the process alive" (Render health-checks this, so a downstream blip can't restart the gateway); `/actuator/health/readiness` reflects the WorkOS verifier, signing key and core-engine reachability (cached, non-blocking). Graceful shutdown drains in-flight proxied requests.
- **Session single-flight** — concurrent misses (and `fresh=true` bypasses) for the same `(user, tenant)` collapse into one upstream computation, so a thundering herd after a cache-emptying deploy can't storm core-engine.
- **Supply-chain gate** — digest-pinned base images, a per-build CycloneDX SBOM and a gating Trivy CVE scan (fails on fixable HIGH/CRITICAL), kept current by Dependabot. Every push also publishes a **cosign-signed, SLSA-attested** image to GHCR (keyless, OIDC) — Render still builds from source today; pulling the signed digest is a documented runbook (`docs/SUPPLY-CHAIN.md`).
- **Deprovisioning webhook** — a signature-verified WorkOS webhook (`/webhooks/workos`); on `user.deleted` it invalidates the removed user's cached authorization *and* calls core-engine's operator `deprovision-user` to strip their engine membership (retried via 500 if core is briefly unreachable). Directory-Sync (`dsync.*`) events await the WorkOS Directory Sync setup.
- **WorkOS role forward (provisioning)** — when the onboarding client provisions a user into core-engine it forwards the WorkOS role slug (falling back to the configured `default-role`); core-engine maps the slug to the canonical engine role via `RoleCatalog.fromWorkosSlug`. Self-signup registration has no IdP role and uses the default. Sourcing the role from the SSO/dsync login token's `role` claim for first-touch provisioning is a deferred follow-up (it only fires on first touch, per the provisioning-default policy).

## Technology

| Concern | Choice |
|---------|--------|
| Language / runtime | Java 21 |
| Framework | Spring Boot 3.5.16 (`-web`, `-actuator`, `-security`, `-validation`) |
| JWT / JOSE | `spring-security-oauth2-jose` (Nimbus) — verify WorkOS tokens, mint/sign act-as tokens |
| Authentication provider | WorkOS User Management (login flows + JWKS verification) |
| Persistence | **None** — stateless gateway |
| Build | Maven (wrapper), packaged as a fat jar |
| Container | Multi-stage Dockerfile — **digest-pinned** Temurin 21 JRE base, non-root, container-aware JVM sizing |
| CI | GitHub Actions — `mvnw verify` on every PR / push to `develop`; a gating **image job** (build → CycloneDX SBOM → Trivy CVE scan, fails on fixable HIGH/CRITICAL); Dependabot; separate Semgrep + gitleaks + Trivy security scan |
| Size | ~40 Java source files, ~134 tests (JUnit / Spring Boot Test, incl. end-to-end JWKS + embedded-Redis) |
| API spec | OpenAPI at `/v3/api-docs` (springdoc, JSON-only) |
| Docs | README + `docs/` — `API.md`, `CONFIGURATION.md`, `ERRORS.md`, `SUPPLY-CHAIN.md`, `DEPROVISIONING.md`, `AUTHZ-DESIGN.md`, `key-rotation.md`, `AUDIT.md` |

## Local development

The service runs on port **8083** locally (the engine uses 8080). Ephemeral defaults let it boot with no secrets for local work.

```bash
./mvnw spring-boot:run          # run locally on :8083
./mvnw clean package            # build the jar
./mvnw -B -ntp verify           # compile + tests + package (what CI runs)
docker build -t luke-auth-engine .
```

Key environment variables (see `src/main/resources/application.yml` for the full set):

| Env var | Purpose |
|---------|---------|
| `CORE_ENGINE_URL` | Upstream engine base URL the gateway proxies to |
| `FILE_PROXY_URL` | Optional — routes `/api/documents/**` bytes to luke-file-proxy instead of core |
| `WORKOS_CLIENT_ID` / `WORKOS_API_KEY` | WorkOS credentials for the server-side login flows |
| `WORKOS_ISSUER` / `WORKOS_AUDIENCE` | Expected token claims (required when strict validation is on) |
| `WORKOS_STRICT_VALIDATION` | Prod: require issuer + audience, fail closed |
| `GATEWAY_PRIVATE_KEY` | PEM PKCS#8 RSA key for signing act-as tokens (ephemeral if unset) |
| `GATEWAY_REQUIRE_STABLE_KEY` | Prod: forbid the ephemeral-key fallback |
| `ALLOWED_ORIGINS` | CORS origin(s) of the consumer UI (local dev allows any localhost port) |
| `SPRING_PROFILES_ACTIVE=prod` | Activates the fail-fast hardening guards |

::: warning Dev-mode backdoor
`LUKE_AUTH_DEV_MODE=true` (with the `dev` profile) enables the `X-Dev-User` header and `/dev/token` for local testing. It must never be enabled in a shared or production environment — the `DevModeGuard` blocks boot if it's set without the `dev` profile.
:::

## Deployment

Deployed as a Docker web service on **Render**, defined by the blueprint in `luke-platform` (the `platform-*-auth` services). The active deployment branch is **`develop`** (matching the platform's develop/qa flow). Render injects `PORT` at runtime; the container runs as a non-root user with a container-aware JVM.

To wire the engine side, set `LUKE_AUTH_GATEWAY_ENABLED=true` and point `LUKE_AUTH_GATEWAY_JWKS_URL` at this service's `/.well-known/jwks.json` on Core Engine. See [Deployment Topology](/concepts/deployment) for how the services fit together.

## Status & gaps

Production-ready and deployed. Known items:

- **Rate limiting is global when `REDIS_URL` is set, per-instance otherwise.** The shared Redis store enforces the credential-endpoint limit across all replicas; without it, limits are per-instance (fine for a single instance / sticky routing). Provisioning Redis + setting `REDIS_URL` is the remaining ops step to switch it on in prod.
- **Directory Sync (`dsync.*`) events** are acknowledged but not yet acted on — the directory-user→platform-user mapping depends on enabling WorkOS Directory Sync (a paid capability) for the tenant. Once enabled, deactivation events reuse the same deprovisioning path as `user.deleted`. Tracked in #38.

> The former stale-Clerk documentation gap is **resolved**, and a supply-chain gate (digest-pinned bases, SBOM, gating CVE scan) now backs the image — its first run caught real CRITICAL RCEs and drove a Spring Boot 3.4.13→3.5.16 bump off the EOL line.

For how this service scores against the broader platform readiness checklist, see the [Completeness Scorecard](/reference/completeness).
