# Platform & Deployment

`luke-platform` is the **meta / ops repository** for the fleet. It contains no application
code — instead it holds the single Render Blueprint that deploys everything, plus the
runbooks, security program and load-test harness that operate the fleet.

> **Repository:** `luke-platform` · **Type:** Infrastructure / operations / docs

## What's in it

| Asset | Purpose |
| --- | --- |
| `render.yaml` | ~1000-line Render **Blueprint** for the **non-prod** fleet: dev + qa services (uat/prod scaffolds disabled) + one shared schema-isolated Postgres, with sizing/OOM rationale and static-site security headers |
| `render.prod.yaml` | Complete **production** Blueprint — all 7 services (engine `postgres,prod` / auth / file-proxy / core-ui / consumer-ui / portal / agents) + a **dedicated** `luke-prod-db`. Inert (not named `render.yaml`) until activated as its own Blueprint |
| `observability/` | Operator kit for OBSERVABILITY V1 (OBS-0/1/3/5) — Grafana Alloy collector, uptime + Sentry setup, alert rules |
| `cutover/` | Production-cutover **runbook**, host-parameterized **smoke test**, and go/no-go checklist |
| `workos/` | WorkOS → Production RBAC role rollout plan (approval-gated; an arming step, not an authz dependency) |
| `README.md` | The fleet runbook — service map, deploy flow, operations |
| `MASTER_TEST_SCRIPT.md` | A manual portal walkthrough (fresher-friendly), tied to specific PRs |
| `MERGE_MASTER_PROMPT.md` / `MERGE_CAPABILITY_INTO_CORE.md` | The capability→core migration playbooks (M0–M5) |
| `security/` | Security program — `PENTEST_SCOPE`, `SECURITY_TESTING`, scan templates |
| `infra/s3/` | S3 provisioning kit + IAM policy template (no-client-secret design) |
| `loadtest/` | k6 load-test harness with monitor/setup scripts |
| `.github/workflows/zap-baseline.yml` | ZAP DAST baseline (the only in-repo CI; per-repo SAST/secret scans live as a distributed template) |

## The deployment model

One blueprint stands up the whole non-production fleet. See
[Deployment Topology](/concepts/deployment) for the environment/branch matrix and the
shared-database rule. In short:

- Six deployables per environment (engine, auth, file-proxy, agents, consumer-ui, core-ui)
  + one shared PostgreSQL with per-environment schema/prefix isolation.
- **Service repos deploy from `develop`/`qa`, not `main`.**
- **Production has its own separate blueprint** — `render.prod.yaml` (all 7 services + a
  dedicated `luke-prod-db`), kept out of this non-prod bundle. It is **built but not yet
  activated**; see [Production readiness](#production-readiness) for the go-live path.

::: tip Deploy checklist
1. Merge the change to the service's **`develop`** branch.
2. Render auto-deploys that environment.
3. For a [headless library](/libraries/forms) change: rebuild the package → re-vendor into
   the app → rebuild/push the app.
4. For the public `/embed` bundle: rebuild it, copy into the **engine** (`static/embed-assets`),
   and push the engine — a consumer-ui push alone does not update it.
:::

## Runbooks

The README and docs carry the operational runbooks: disaster recovery, rollback, incident
triage, and scaling / high-availability guidance. The engine also ships its own DR /
rollback / triage runbooks alongside the migration plan.

## Production readiness

Production go-live is being prepared as three tracked verticals (GitHub trackers in
`luke-platform`), each with committed operator artifacts:

| # | Vertical | Artifacts | Tracker | State |
| --- | --- | --- | --- | --- |
| 1 | **Observability** | `observability/` (Grafana Alloy, uptime, Sentry, alerts) | [#13](https://github.com/Luke-works/luke-platform/issues/13) | Code done (metrics + Sentry live on dev, env-gated); operator SaaS wiring pending |
| 2 | **Prod cutover** | `cutover/` (runbook + smoke test + go/no-go) · `render.prod.yaml` | [#14](https://github.com/Luke-works/luke-platform/issues/14) | Prep + full prod blueprint done; blocked on prod infra + `develop→main` promotion |
| 3 | **WorkOS→Prod RBAC** | `workos/PRODUCTION_ROLE_ROLLOUT.md` | [#15](https://github.com/Luke-works/luke-platform/issues/15) | Plan done; **deferred** — an arming step, *not* an authz dependency (RBAC is engine-owned) |

Two hard blockers keep the fleet from being prod-deployable today: the **`develop`→`main`
gap** (main = current prod, and the whole hardening effort is on `develop`, live on dev/qa
only), and — until `render.prod.yaml` — the absence of any prod path for auth-engine /
consumer-ui / file-proxy (the last still needs a `main` branch created). The cutover runbook
is the authoritative go-live checklist.

## Security program

The `security/` directory defines a three-layer program — documented scope
(`PENTEST_SCOPE`), a `SECURITY_TESTING` guide, per-repo scan templates (Semgrep / gitleaks /
Trivy), and the ZAP DAST baseline. See [Security](/operations/security).

## Status & gaps

<span class="pill partial">Active · prod deferred</span>

- A complete **production** blueprint (`render.prod.yaml`) now exists but is **inert pending
  activation** + operator provisioning (prod DB, secrets, a `luke-file-proxy` `main` branch)
  and the `develop→main` promotion. See [Production readiness](#production-readiness).
- Only one CI workflow lives in-repo; per-repo scans are template-only.

See the [Completeness Scorecard](/reference/completeness) for the full rating.

## See also

- [Deployment Topology](/concepts/deployment) · [Security](/operations/security) ·
  [Testing](/operations/testing)
