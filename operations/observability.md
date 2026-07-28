# Observability

Monitoring is the fleet's **most uneven axis**. Security monitoring is strong — the code is
scanned continuously and dependencies are watched — and every service has a liveness check the
platform acts on. But there is **no observability stack**: no metrics/APM, no external uptime
monitor, no alerting layer, and error tracking is client-side only. This page is the honest
current picture plus the plan to close the gap (`luke-platform` **OBSERVABILITY V1**, OBS-0..OBS-6).

> **Scope:** cross-cutting. Backlog: `luke-platform/BACKLOG.md` → *Observability*.

## What's monitored today

### Continuous security monitoring ✅
Scheduled scans re-run on a **weekly cron** regardless of pushes, so unchanged code is still
checked against newly-disclosed CVEs.

| Signal | Cadence | Where |
| --- | --- | --- |
| Security Scan (SAST + secret-scan + dep-audit) | on PR/push **+ weekly** (Mon 06:00 UTC) | 7 repos (core-engine, auth-engine, agents, file-proxy, consumer-ui, core-ui, email) |
| CodeQL | on PR/push **+ weekly** (Mon 06:00 UTC) | consumer-ui, core-ui |
| ZAP Baseline (DAST) | **weekly** (Mon 05:00 UTC) vs staged QA | luke-platform |
| Dependabot | continuous | file-proxy, consumer-ui, core-ui, workflow, auth-engine, forms |

See [Security](/operations/security) for the scan program.

### Liveness / health ✅ basic
- **Spring Boot Actuator** on core-engine, auth-engine, file-proxy (and task-engine). core-engine
  exposes `health,info,metrics` with liveness/readiness **probes** — readiness includes the
  datasource, so a DB-down instance reports NOT ready and the platform stops routing to it.
- **Render `healthCheckPath`** pings `/actuator/health` (readiness/liveness) and **auto-restarts
  unhealthy instances**. This is the only always-on uptime signal today.
- Every backend log line carries a **correlation id** (`CorrelationIdFilter`, MDC `correlationId`)
  for request tracing.

### Metrics ✅ exposed, not yet collected
- **Micrometer + `micrometer-registry-prometheus`** on core-engine, auth-engine and file-proxy
  (OBS-2), exposing `/actuator/prometheus` behind a **scrape token** — never public.
- Nothing scrapes it yet. The numbers exist; no dashboard, retention or alert reads them until
  OBS-3 stands up a collector.

### Error tracking ⚠️ wired, awaiting a DSN
- `@sentry/react` is wired in **consumer-ui** and **core-ui** via `observability.ts` — captures
  uncaught errors, promise rejections, perf traces, tagged by tenant/user (ids only, no PII).
- **`sentry-spring-boot-starter-jakarta`** is now wired on core-engine, auth-engine and file-proxy
  too (OBS-4), so JVM errors no longer live only in Render logs.
- Both halves are **DSN-gated and default-off** (`if (!dsn) return` / unset `SENTRY_DSN`). They stay
  inert until a DSN is provisioned; the platform CSP also still needs the Sentry origin pinned.

## The gaps

| Gap | Impact |
| --- | --- |
| **Nothing collects the metrics** | Micrometer/Prometheus endpoints exist (OBS-2) but no collector, dashboard or retention — so there is still no view of latency, throughput, error-rate or resource trends over time. |
| **No external uptime monitor** | If Render's health check *and* auto-restart both fail, nothing independently alerts a human. |
| **No DSN provisioned** | Sentry is wired end-to-end (OBS-1/OBS-4) but inert everywhere until a project exists and the DSN is set, so errors still surface only in Render logs. |
| **No alerting layer** | No PagerDuty/Slack/email routing for health-check failures or scan findings. |
| **Dependabot gaps** | core-engine, agents, email, analytics, lists, signatures rely on the weekly `deps` job with no auto-PRs. |

## The plan — OBSERVABILITY V1

Sequenced by leverage ÷ effort; Phase 0 alone removes the scariest gap in a few hours. All
free-tier, all env-gated (no-op when unset), backends ship to `develop`.

- **Phase 0 — quick wins.** `OBS-0` external uptime monitor + Slack · `OBS-1` enable the existing
  Sentry (env + CSP, no code).
- **Phase 1 — metrics.** `OBS-2` `micrometer-registry-prometheus` + expose `/actuator/prometheus`
  on the JVM backends · `OBS-3` Grafana Alloy collector → Grafana Cloud, stock Spring Boot dashboard.
- **Phase 2 — alerting + backend errors.** `OBS-4` `sentry-spring-boot-starter` (DSN-gated) ·
  `OBS-5` Grafana alert rules (5xx spike, p95 latency, DB-pool, readiness DOWN) → Slack.
- **Phase 3 — document.** `OBS-6` flesh out this page + bump the [scorecard](/reference/completeness).

::: tip Why push, not scrape
Phase 1 uses Grafana Cloud + an Alloy agent (`remote_write`) rather than a self-hosted,
scrape-only Prometheus: a self-hosted Prometheus can't easily reach Render's public services,
so the agent pushes out instead.
:::

::: info Status
Planned as of 2026-07-23 — nothing shipped yet. The [Completeness Scorecard](/reference/completeness)
scores are unchanged; this is the tracked path to lift the fleet's monitoring posture.
:::
