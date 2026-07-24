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
- **Per-IP rate limiting** — a fixed-window limiter over the credential/token endpoints (`/auth/login`, `/auth/register`, `/auth/password`, `/service/token`), keyed by client IP + path.
- **Correlation-id filter** — tags every log line (MDC `correlationId`) and forwards the id to Core Engine so a trace spans the gateway hop.
- **Audit logger** — privileged/auth events on a dedicated `luke.audit` logger, always emitted at INFO for a filterable trail.
- **Service-key hashing + live revocation** — service keys may be stored SHA-256-hashed at rest, carry `;exp=` self-expiry and `;scope=` metadata, and be revoked live via `POST /service/keys/{keyId}/revoke` with an operator token (no redeploy).
- **XFF trusted-proxy-hops** — client IP is resolved from `X-Forwarded-For` honoring a configured number of trusted reverse-proxy hops, so a spoofed prepended header can't fool the rate limiter or audit source IP.
- **Key rotation with overlap** — a previous public key can be published in the JWKS alongside the current one, so tokens signed by either `kid` verify during a zero-downtime rotation window (see `docs/key-rotation.md`).

## Technology

| Concern | Choice |
|---------|--------|
| Language / runtime | Java 21 |
| Framework | Spring Boot 3.4.13 (`spring-boot-starter-web`, `-actuator`) |
| JWT / JOSE | `spring-security-oauth2-jose` (Nimbus) — verify WorkOS tokens, mint/sign act-as tokens |
| Authentication provider | WorkOS User Management (login flows + JWKS verification) |
| Persistence | **None** — stateless gateway |
| Build | Maven (wrapper), packaged as a fat jar |
| Container | Multi-stage Dockerfile (Temurin 21 JRE, non-root, container-aware JVM sizing) |
| CI | GitHub Actions — `mvnw verify` on every PR / push to `develop`; separate Semgrep + gitleaks + Trivy security scan |
| Size | ~28 Java source files, ~92 tests (JUnit / Spring Boot Test) |
| Docs | README + `docs/` — `API.md` (HTTP surface), `CONFIGURATION.md` (every setting + prod checklist), `ERRORS.md` (error contract), `AUTHZ-DESIGN.md`, `key-rotation.md`, `AUDIT.md` |

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

Production-ready and deployed. One known item to be aware of:

- **In-memory, per-instance rate limiting.** The credential/token rate limiter keeps its counters in process memory, so limits are enforced **per instance** and reset on restart. A single instance (or sticky routing) is fine; horizontal scale-out would want a shared store to enforce a global limit.

> The former stale-Clerk documentation gap is **resolved** — the README, config comments, and `pom.xml` are fully WorkOS, and a new `docs/API.md` + `docs/CONFIGURATION.md` document the HTTP surface and every setting.

For how this service scores against the broader platform readiness checklist, see the [Completeness Scorecard](/reference/completeness).
