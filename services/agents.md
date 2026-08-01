# Agents (AI)

The Agents service is Lukeflow's **multi-agent LLM platform**: a fleet of small, self-contained AI agents hosted behind **one** FastAPI app and **one** cheap deployment. Each agent turns plain-language input into a validated, schema-shaped JSON object the rest of the platform can consume — a form schema, an email document, a workflow, or a sentiment classification.

<span class="pill ready">Production-ready · deployed</span>

> **Repository:** `luke-agents` · **Type:** Platform service · **Stack:** Python 3.12 / FastAPI / Groq

## Overview

Every agent solves the same shape of problem: *describe what you want in natural language, get back a strict, machine-readable object*. Rather than run a separate service per agent (and pay for each), `luke-agents` hosts them together. A shared `core` layer handles everything an agent needs — LLM brain selection, per-caller rate limiting, tenancy, auth, and transcript recording — and each agent is just a package that contributes a system prompt, a Pydantic response schema, and a FastAPI router.

The service is called browser-direct today (e.g. the [Consumer UI](/apps/consumer-ui) Form Builder posts a description and renders the returned schema live) and is designed to move behind the auth gateway server-side, at which point the API-key and tenant gates close fully. It **supersedes** the old standalone `luke-form-agent`: the form agent is still served at the root `POST /chat`, so pointing a legacy client's `VITE_FORM_AGENT_URL` at this service is a drop-in swap.

::: info Headless by design
The agents only produce and validate JSON. They do not persist forms, send email, or run workflows — those belong to Core Engine and the [Forms](/libraries/forms) / [Email](/libraries/email) libraries. An agent's output is an artifact the caller then owns.
:::

## Architecture

The design is a **shared core + one package per agent**. The `Agent` contract (`core/registry.py`) is small: an `AgentMeta` (slug, name, description, version) plus a `build_router()` that returns the agent's endpoints and an optional `static_index()` for a browser test client. `build_app()` (`core/server.py`) mounts every agent under `/agents/<slug>`, and also mounts the chosen default (`form`) at the root for single-agent compatibility.

```
consumer-ui / core-engine
        │  POST /agents/<slug>/chat   (+ X-Agents-Key, X-Tenant-Id, X-Correlation-Id)
        ▼
┌──────────────────────── FastAPI app (build_app) ────────────────────────┐
│  CorrelationIdMiddleware → CORS → require_api_key → router per agent      │
│                                                                          │
│   agents/form │ email │ sentiment │ workflow   (one package each)        │
│        │  resolve_tenant → ratelimit.enforce(key) → core.llm.generate()  │
│        └─ background: transcripts.record(turn)  (never fails the request)│
└──────────────────────────────────────────────────────────────────────────┘
```

**The canonical request pattern** every agent follows: resolve the tenant from `X-Tenant-Id`, build a namespaced rate-limit key (e.g. `form:t:acme:ip:1.2.3.4`) and `enforce()` it (HTTP 429 on overflow), call `core.llm.generate(system, user, ResponseModel)` to get a validated typed object, return it, and record the turn in a background task (zero added latency, can never fail the chat). The LLM call is schema-forced JSON validated with Pydantic, so callers always get a well-formed object or a mappable error.

| Agent (slug) | Name | Version | Endpoints | Produces |
|--------------|------|---------|-----------|----------|
| `form` | LukeBuilds Form Builder | 0.2.0 | `POST /chat`, `POST /testdata`, `POST /feedback` | coltorapps form schema (chat-to-build forms) + test-data + keep/undo feedback |
| `email` | LukeMail Email Template Builder | 0.1.0 | `POST /chat`, `POST /testdata` | bounded `EmailDoc` from a plain-language brief |
| `sentiment` (LukeSense) | LukeSense Sentiment Analyzer | 0.1.0 | `POST /analyze`, `POST /batch`, `POST /intake` | sentiment / urgency / theme classification of short business text |
| `workflow` | LukeFlow Workflow Builder | 0.1.0 | `POST /chat` | valid, wireable `WorkflowDoc` |

### LukeBuilds renders schemas the product will actually accept

The form agent does **not** let the LLM write a builder schema. The model emits a flat field list
(`FormSpec`); deterministic Python renders that into the coltorapps schema. That split is what
makes the output testable without an LLM at all — and it needed testing.

Probing 50 form combinations on 2026-08-01 and validating each with **form-core's real
`validateSchema`** found **seven** that rendered schemas the product rejects as *errors*. Errors
block check-in and publish, so LukeBuilds could produce a form its author was then unable to ship.
All seven were data keys the model chose:

| Model writes | Rejected as |
|---|---|
| `Full Name`, `e-mail`, `a.b` | `invalid-key` — not an identifier |
| `naïve`, `姓名` | `invalid-key` — not ASCII |
| `123` | `invalid-key` — leading digit |
| `""` | fell back to the entity UUID, itself invalid |
| two fields sharing a key | `duplicate-key` — their answers would collide |
| a field named like a container's nested **child** | `duplicate-key` |

The prompt *asks* for snake_case, which is not the same as holding the model to it — and the last
case it cannot avoid unaided, since it never sees a container's children yet shares their
submission namespace.

`spec_to_schema` now normalises every key at the single point where schemas are produced. Accents
decompose rather than vanish (`naïve` → `naive`), an unusable key falls back to the **label**
before an anonymous name (`123` on "Age" → `age`), duplicates are suffixed with the first field
keeping the plain key, a preserved entity always wins the key it already owns (renaming it would
silently move existing data), and a valid author-chosen key is untouched (`firstName` survives).

::: tip The contract is enforced in BOTH languages
`tests/form_matrix.py` builds the combination matrix — every field type (read off `FieldType`, so
a new type enrols itself), every logic action, choice/label/key edge cases, the merge path and
containers — and `test_schema_key_safety.py` asserts the invariants Python can see.

The rendered schemas are then checked into **luke-forms** as `fixtures/agent-schema-cases.json`,
where `agentSchema.parity.test.ts` runs form-core's own validator over them, mirroring how
`validation-parity.json` is shared with core-engine. Python cannot decide what a valid schema is;
only form-core can. It also catches drift the other way — tighten `KEY_REGEX_SOURCE` or
`RESERVED_KEYS` and that suite fails, instead of the agent quietly shipping schemas the product
no longer accepts.
:::

`GET /health` is a **liveness** signal (always 200 if the process is up — Render health-checks it, so a downstream blip can't restart the instance) reporting the active brain, the transcript backend (with an `ephemeral` flag and write counters), the default agent, and the mounted agents. `GET /health/ready` is a **readiness** probe that checks real dependencies — a brain must be resolvable and the transcript store reachable (Postgres `SELECT 1`) — and returns **503** when a dependency is down. Startup/shutdown run via a lifespan context manager (not deprecated `on_event` hooks). `GET /metrics` is an open Prometheus scrape target (request volume + latency + status, transcript-write counters, and **`agents_llm_tokens_total{brain,model,type}`** — LLM token consumption, the fleet's primary cost signal; `llm.last_usage()` also exposes per-turn usage for per-tenant spend accounting). `GET /` serves the default agent's UI (or a landing page).

The API is **versioned**: the canonical path is `/v1/agents/<slug>/...` (documented in a curated OpenAPI at `/openapi.json` — real description, the `X-Agents-Key` security scheme, a server entry, app version `1.0.0`). Legacy unversioned paths (`/agents/<slug>/...` and the default `form` agent at the root, e.g. `POST /chat`) keep working for drop-in compatibility and are hidden from the schema.

## Key features

Hardening is layered so dev/qa stay lenient (browser-direct, no gateway) while a production deployment fails fast on any missing guard — mirroring core-engine's strict prod profile.

- **Shared API-key gate** — a single `require_api_key` dependency is applied at the router level, so every current *and future* agent route is covered automatically. Default-lenient: unset `AGENTS_API_KEY` is a no-op; set it and callers send a matching `X-Agents-Key`. Compared with `hmac.compare_digest`.
- **Prod fail-fast guard** — with `AGENTS_ENV=prod`, `assert_prod_hardened()` refuses to boot unless the API key, a non-`*` CORS list, and `AGENTS_REQUIRE_TENANT` are all set — a misconfig can't silently ship an open, world-CORS, token-burnable service.
- **CORS regex** — exact origins go to `allow_origins`; entries with a `*` subdomain wildcard (e.g. `https://*.lukeflow.com`) compile to an `allow_origin_regex` (Starlette's `allow_origins` is exact-match only). Misconfigured/empty fails closed to same-origin.
- **Redis rate-limiter** — a sliding-window log in a Redis sorted set makes the per-caller budget global across workers/instances and durable across redeploys. Without `REDIS_URL` it falls back to an in-memory limiter (single-worker dev only). Default cap: 200 actions / 3 hours.
- **Per-tenant daily token cap** — a spend ceiling *on top of* the per-caller rate limit. The rate limit caps how many **actions** a caller makes; this caps how many **LLM tokens a tenant burns per UTC day** — the fleet's real cost driver (a tenant spread across many IPs/user_ids can stay under every per-caller limit yet run up unbounded spend). Check-then-charge: `AGENTS_TENANT_DAILY_TOKEN_CAP` rejects (429 + `Retry-After` to midnight UTC) a tenant already at its ceiling, and every turn's tokens (summed across multi-call turns) are charged to the tenant via the same Redis-or-in-memory backend as the rate limiter. **OFF unless set to a positive integer** (dev/qa unaffected); suggested `1000000`/day ≈ $9/mo worst-case per tenant on the default model. Tier-aware limits + durable per-tenant token history are the deliberate next layer (billing).
- **Per-tenant isolation** — every recorded/paid request is scoped to a tenant read from `X-Tenant-Id`, so budgets, transcripts, and exports are isolated per organization. `AGENTS_REQUIRE_TENANT=true` fails closed (400) when behind the gateway.
- **LLM timeouts + resilience** — a hard per-call timeout (`LLM_TIMEOUT_SECONDS`, default 30) on every provider client, so a hung upstream can't block the worker indefinitely. Each brain call is wrapped in bounded transient-retry with exponential backoff (timeouts / dropped connections / 5xx — a single blip no longer surfaces as a 502) plus a per-brain **circuit breaker** that opens after repeated failures and fails fast during a cooldown (a 429 is left for the agent's friendly degrade). Provider SDK clients are constructed once and reused, so connection pools persist across turns.
- **Correlation-ID logging** — a middleware accepts a safe `X-Correlation-Id` (or generates one), echoes it, and tags every JSON log line — a trace spans the same header the Java services use.
- **PII redaction & retention** — form/email content can carry PII; `tools/retention.py` prunes aged transcripts and redaction keeps sensitive fields out of logs (see `docs/DATA_HANDLING.md`).
- **Consent-gated transcripts** — every `/chat` turn is recorded as a ready-made supervised training example, but passing `consent:false` excludes that turn, and explicit `feedback` (`accepted:false` / `rating:-1`) is dropped from exports.
- **Audit trail + operator-gated export** — sensitive actions write an append-only `audit_log` row (actor, action, scope, request id, timestamp; queryable). A `/feedback` label change is audited against the **verified principal** (the gateway-set tenant, never the client-supplied `user_id`). The fine-tune export / tenant-erasure CLI is gated behind an operator credential (`AGENTS_OPERATOR_TOKEN` + `--operator-token`) and records who exported what.
- **Supply-chain gate** — every dependency is version-pinned (no unpinned floors that let a future release silently break the build), and a **gating `pip-audit` CI job** fails the build on any dependency CVE. A small triaged baseline (a `starlette` finding awaiting a coordinated FastAPI upgrade) is explicitly ignored with a comment, so a pre-existing finding can't block delivery while any *newly-introduced* vulnerable dependency does. Complements the fleet's informational Semgrep/gitleaks/Trivy scan.

## Technology

| Concern | Choice |
|---------|--------|
| Language / runtime | Python 3.12 (`.python-version`; Render pins `PYTHON_VERSION=3.12.8`) |
| Framework | FastAPI 0.116 + `uvicorn[standard]` |
| Validation | Pydantic 2.10 (typed, schema-forced JSON per turn) |
| Default brain / model | **Groq** — `openai/gpt-oss-120b` primary, `llama-3.3-70b-versatile` fallback |
| Alternate brains | OpenAI (`gpt-5-nano`, Structured Outputs), Gemini (`gemini-2.0-flash`), Ollama (`qwen2.5:7b`, local dev) — first key present wins, or force with `AGENTS_BRAIN` |
| Rate-limit store | Redis (`redis` 5.2, sorted-set sliding window) or in-memory fallback |
| Transcript store | Postgres (`psycopg2-binary`, `luke_agents` schema; schema managed by **Alembic** migrations run as a pre-deploy step) or append-only JSONL (dev) |
| CI | GitHub Actions — compileall + `pytest` on 3.12 every PR / push to `develop`; separate Semgrep + gitleaks + Trivy security scan |
| Tests | ~91 tests across ~14 files (ratelimit/Redis, tenancy, prompt-injection bounds, retention/PII, streaming export, timeouts, security hardening, observability) |
| Container | **None** — Render-native Python runtime (no Dockerfile) |

The brain layer (`core/llm.py`) is agent-agnostic: an agent hands `generate()` its system prompt, the user message, and the Pydantic model it wants back, and the module drives whichever backend is active, forces schema-shaped JSON, validates, and returns the typed object.

## Local development

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # paste a Groq key, OR leave blank + run Ollama
uvicorn main:app --reload
# open http://localhost:8000
```

Get a free Groq key (email signup, no card) at <https://console.groq.com/keys>. To run the tests the way CI does:

```bash
pip install pytest fakeredis  # fakeredis backs the Redis rate-limiter test
python -m pytest -q           # repo root on sys.path so `import luke_agents` resolves
```

::: tip Adding an agent
Create `luke_agents/agents/<name>/` with an `Agent` subclass that sets `meta` and implements `build_router()`, call `core.llm.generate(...)` and `ratelimit.enforce(...)` inside it, then add an instance to `main.py`'s `AGENTS` list. It mounts at `/agents/<slug>` automatically — and inherits the auth, CORS, tenancy, and correlation-id plumbing for free.
:::

## Deployment

Deployed on **Render** via a `render.yaml` **Blueprint** (New ➜ Blueprint picks it up). It runs on the native Python runtime — no Dockerfile — with `pip install -r requirements.txt` and `uvicorn main:app --host 0.0.0.0 --port $PORT`. Secrets (`GROQ_API_KEY`, `OPENAI_API_KEY`, `AGENTS_BRAIN`, `REDIS_URL`, `DATABASE_URL`) are `sync:false`, set per service in the dashboard so they stay out of git.

::: warning Multi-worker needs Redis
The in-memory rate limiter is correct only for a single always-on single-worker instance. Any multi-worker / HA / autoscaled run **must** set `REDIS_URL` (a Render Key Value instance) or the per-caller budget is per-worker and the effective cap is multiplied. Likewise, set `DATABASE_URL` for durable transcripts — Render's disk is ephemeral, so JSONL recording does not survive a redeploy.
:::

## Status & gaps

Production-ready and deployed. Known items to be aware of:

- **Durable, observable transcript writes.** Turn writes run off the response path on a bounded queue that retries transient DB/pool errors with backoff, counts drops (surfaced at `/health`, never a silently-swallowed exception), and is flushed on graceful shutdown (Render SIGTERMs on every redeploy). The Postgres pool is sized via `AGENTS_DB_POOL_MIN/MAX`. JSONL is **dev-only**: in production (`AGENTS_ENV`) with transcripts enabled and no `DATABASE_URL`, recording is **disabled with a loud warning** rather than silently written to Render's ephemeral disk — set `DATABASE_URL` for durable retention and fine-tuning exports. Recording still never fails a chat.
- **Versioned schema migrations.** The transcript schema is managed by Alembic (`migrations/`), not ad-hoc inline DDL: ordered, reviewable revisions parameterized by `AGENTS_DB_SCHEMA`, applied via `alembic upgrade head` as a `render.yaml` pre-deploy step (a no-op when `DATABASE_URL` is unset). CI spins Postgres and asserts they upgrade, reverse, and re-apply cleanly. The app's `init()` remains a runtime safety-net so a first boot works before migrations run.
- **No live-LLM integration tests.** The ~104 tests cover the plumbing (rate limiting, tenancy, prompt-injection bounds, retention/PII, export streaming, timeouts, transcript durability) with the model mocked; there is no test that exercises a real Groq/OpenAI call end-to-end, so provider/model drift is caught only at runtime.
- **Auth/tenant gates default-lenient.** The API-key and tenant checks are no-ops until `AGENTS_API_KEY` / `AGENTS_REQUIRE_TENANT` are set, which is intended for the current browser-direct flow but means the unauthenticated surface only closes once traffic routes through the gateway server-side.

For how this service scores against the broader platform readiness checklist, see the [Completeness Scorecard](/reference/completeness).
