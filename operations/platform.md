# Platform & Deployment

`luke-platform` is the **meta / ops repository** for the fleet. It contains no application
code — instead it holds the single Render Blueprint that deploys everything, plus the
runbooks, security program and load-test harness that operate the fleet.

> **Repository:** `luke-platform` · **Type:** Infrastructure / operations / docs

## What's in it

| Asset | Purpose |
| --- | --- |
| `render.yaml` | ~890-line Render **Blueprint**: 18 web/static services across dev/qa/uat + one shared schema-isolated Postgres, with sizing/OOM rationale and static-site security headers |
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
- **Production is deliberately out of this blueprint** — it is deferred and provisioned
  separately when it lands.

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

## Security program

The `security/` directory defines a three-layer program — documented scope
(`PENTEST_SCOPE`), a `SECURITY_TESTING` guide, per-repo scan templates (Semgrep / gitleaks /
Trivy), and the ZAP DAST baseline. See [Security](/operations/security).

## Status & gaps

<span class="pill partial">Active · prod deferred</span>

- `BACKLOG.md` is nearly empty (a single resolved item).
- The **production** blueprint is not present here (deferred by design).
- Only one CI workflow lives in-repo; per-repo scans are template-only.

See the [Completeness Scorecard](/reference/completeness) for the full rating.

## See also

- [Deployment Topology](/concepts/deployment) · [Security](/operations/security) ·
  [Testing](/operations/testing)
