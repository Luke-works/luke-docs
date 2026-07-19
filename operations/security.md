# Security

Security is a **fleet-wide strength**. Every deployed service fails fast rather than run
insecurely, enforces tenant isolation, and is scanned for vulnerabilities. This page
collects the cross-cutting security posture; per-component detail lives on each service page.

## Fail-fast boot guards

The Java services refuse to start in an unsafe configuration. Representative guards:

| Guard | Refuses to boot when… |
| --- | --- |
| `StrictProfile` (`prod`) | Production security invariants aren't met |
| `InsecureKeyGuard` | A signing/service key is insecure or unset in prod |
| `AdminPasswordGuard` | A default admin password is present in prod |
| `H2ConsoleGuard` | The H2 console is exposed |
| `DevModeGuard` (auth) | Dev-mode is on without the dev profile |
| `EdgeHardeningGuard` / `AuthHardeningGuard` | Edge/auth hardening prerequisites are missing |
| `DocstoreProdGuard` (file-proxy) | Prod storage prerequisites are missing |

This "crash rather than run insecurely" stance means a misconfigured production deploy stops
at boot, not after a breach.

## Authentication & authorization

- **WorkOS** front door → stateless [Auth Engine](/services/auth-engine) → engine enforcement.
  The gateway holds no policy; the engine is the sole enforcer.
- **Per-tenant isolation** everywhere (see [Multi-Tenancy](/concepts/tenancy)); foreign-tenant
  reads are refused; the operator cockpit never lists all tenants.
- **Token-derived tenancy** for S3 — clients can't address another tenant's objects.
- Service-to-service calls use a **fail-closed internal shared-secret**; service keys are
  hashed with live revocation.

See [Authentication & Authorization](/concepts/auth).

## Application-layer hardening

- **Forms** — QuickJS WASM sandbox as a real security boundary for author-provided JS,
  DOMPurify (SSR-aware) HTML sanitization, prototype-pollution guard, an in-house
  `exprParser` that replaced the vulnerable `expr-eval`, and autofill suppression.
- **Email** — URL allow-list (drops `data:` / `javascript:`), color-grammar coercion (no CSS
  injection), field bounds (DoS caps), HTML-escaped merge, sandboxed preview iframe.
- **File Proxy** — multipart/broker/schema size caps, semaphore back-pressure (503 shedding),
  on-the-fly SHA-256.
- **UIs** — auth guards, error boundaries, Sentry, DOMPurify; static-site security headers
  (frame DENY, HSTS, nosniff). CSP is enforced on consumer-ui and **report-only** on core-ui.

## Supply-chain & scanning

| Layer | Tooling |
| --- | --- |
| SAST | **Semgrep** across services |
| Secret scanning | **gitleaks** |
| Dependency / container | **Trivy**, plus `npm audit` gates on several libraries and CycloneDX **SBOM** generation |
| DAST | **ZAP** baseline in [`luke-platform`](/operations/platform) |
| CodeQL | On the UIs |
| Dependabot | Active across repos |

::: warning Non-gating scans
On the engine and gateways the Semgrep/gitleaks/Trivy scans currently run
**`continue-on-error`** (informational). They report but do not fail the build — a
deliberate, revisitable choice. Making them gating is a known hardening step.
:::

## Public surface

The embeddable forms surface (`/api/public/**`, `/embed*`) uses HMAC bearer tokens, per-tenant
`frame-ancestors`, server-side validation, token revocation and anti-abuse, with an explicit
any-origin/no-credentials CORS carve-out. Email assets are public-by-id (unguessable UUID).
See [Authentication & Authorization](/concepts/auth).

## Program & scope

`luke-platform/security/` documents the program: `PENTEST_SCOPE`, a `SECURITY_TESTING` guide,
the scan templates, and the no-client-secret S3 design. Backlogs and security bugs are tracked
as **private draft advisories** on GitHub Issues per repo.

## See also

- [Authentication & Authorization](/concepts/auth) · [Multi-Tenancy](/concepts/tenancy) ·
  [Platform & Deployment](/operations/platform) · [Completeness Scorecard](/reference/completeness)
