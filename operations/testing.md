# Testing

Testing rigor across the fleet is **uneven by design** — the headless libraries are built
test-first and are the most thoroughly covered code in the platform, while the UIs and some
young libraries lag. This page maps the strategy per layer.

## Test coverage at a glance

| Component | Unit / integration | End-to-end | Notes |
| --- | --- | --- | --- |
| [`luke-forms`](/libraries/forms) | ~570 tests / 36 files incl. **fuzz** + perf + golden | 15 Playwright specs + **axe-core** a11y | The fleet's gold standard |
| [`luke-core-engine`](/services/core-engine) | ~361 `@Test` / 96 files | functional (tenant isolation, API auth) | Broad module + guard coverage |
| [`luke-agents`](/services/agents) | ~91 tests / 15 files | — | Ratelimit, tenancy, prompt-injection, PII/retention |
| [`luke-email`](/libraries/email) | ~82 tests / 10 files | — | Model, variable contract, compile |
| [`luke-auth-engine`](/services/auth-engine) | ~75 tests / 22 files | functional proxy auth | Guards, verifier, rate limiter |
| [`luke-consumer-ui`](/apps/consumer-ui) | ~128 unit cases / 18 files | 4 Playwright specs (**31-route × viewport matrix**) | Hermetic, stubbed gateway |
| [`luke-analytics`](/libraries/analytics) | ~72 tests / 10 files | — | Engine, validateQuery, aggregations |
| [`luke-workflow`](/libraries/workflow) | ~61 tests / 12 files | — | Golden fixtures, validate, repair |
| [`luke-signatures`](/libraries/signatures) | ~42 tests (sign-core only) | — | **React components untested** |
| [`luke-lists`](/libraries/lists) | ~27 tests / 6 files | — | react/builder thin (`passWithNoTests`) |
| [`luke-file-proxy`](/services/file-proxy) | ~23 tests / 6 files | — | Render + S3 store lightly covered |
| [`luke-core-ui`](/apps/core-ui) | 17 unit files | **1 login spec** for ~30 pages | E2E is the biggest gap |
| [`luke-marketing-ui`](/apps/marketing-ui) | none | none | Static marketing site |
| [`luke-task-engine`](/reference/completeness) | 1 (`contextLoads`) | — | Experimental, superseded |

## CI gates

Most repos run their tests as a **blocking** CI gate. Notable specifics:

- **Java services** run `mvnw verify`; **libraries** run `build → typecheck → test`, several
  with a **blocking supply-chain audit** and a CycloneDX SBOM.
- **`luke-forms`** additionally gates on an **API-surface guard** and a **size budget**.
- **`luke-consumer-ui`** gates on `eslint --max-warnings 0` plus Playwright e2e.
- **`luke-core-ui`** runs lint as **`continue-on-error`** (non-gating) — pre-existing `any`
  and lint debt do not fail the build.
- **`luke-signatures`** and **`luke-workflow`** have **no CI workflow at all** yet, despite
  release wiring — the most impactful quick win (see [Completeness Scorecard](/reference/completeness)).

## Manual & load testing

- **`luke-platform`** carries `MASTER_TEST_SCRIPT.md` — a manual portal walkthrough tied to
  specific PRs — plus a **k6** load-test harness and a **ZAP** DAST baseline.
- **`luke-api-collection`** is a Postman collection that exercises the engine API via the
  real login flow across environments (2xx smoke assertions today). See
  [API Collection](/operations/api-collection).

## Security testing

Semgrep / gitleaks / Trivy scans run across the services (currently **informational /
non-gating** on the engine and gateways). See [Security](/operations/security).

::: tip Highest-leverage test work
1. Add CI to `luke-signatures` and `luke-workflow` (already green locally, just ungated).
2. Cover the `luke-signatures` React components (~2k LOC untested).
3. Broaden `luke-core-ui` e2e beyond the single login spec.
:::
