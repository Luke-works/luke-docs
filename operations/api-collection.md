# API Collection

`luke-api-collection` is a **Postman collection** that exercises the [Core Engine](/services/core-engine)
API the same way the web app does — logging in through the real auth flow, then walking each
capability's endpoints as chained happy-path scenarios.

> **Repository:** `luke-api-collection` · **Type:** Postman test asset

## What's in it

| File | Purpose |
| --- | --- |
| `Lukeflow.postman_collection.json` | The collection — ~134 requests across ~20 folders |
| `Lukeflow.Dev/QA/Prod.postman_environment.json` | Per-environment variables (gateways, tenants, secrets) |
| `generate.mjs` | The **source of truth** — regenerates the collection + all three envs with fixed ids, so diffs stay clean |
| `set-env.sh` | Helper to select an environment |

## Coverage

The collection spans the full engine surface: **Auth** (login/refresh), **Forms**
(definitions, instances, outbound send, public embed, OTP recipient, inbox/trace),
**Email**, **Phone**, **Signatures**, **Workflow**, **Capabilities & Access**, **Topics**,
**Minions**, and **Internal** endpoints.

Requests **chain**: each folder captures ids into environment variables
(`formId`, `embedToken`, `respondAccessToken`, `signToken`, `runInstanceId`, …) with
`pm.environment.set`, so a folder runs top-to-bottom as a happy-path flow that mimics the app.

## Auth models exercised

The README documents which auth model each area uses:

| Model | Used by |
| --- | --- |
| **Tenant** (WorkOS act-as-user via gateway) | Most capability endpoints |
| **Public** (HMAC token) | Embed / respond flows |
| **Recipient** (OTP) | Outbound form recipients |
| **Internal** (shared secret) | Service-to-service |
| **Operator** (Basic) | Admin / cockpit endpoints |

## Secret hygiene

All sensitive values are **empty with `type: secret`** (password, accessToken, internalKey,
operatorPass); `.env*` is gitignored; no tokens are committed. Dev/QA gateways are real
public URLs; the **Prod** gateway is a placeholder (`REPLACE-prod-gateway.example`).

## Local use

```bash
# Select an environment, then import the collection + env into Postman (or run via newman)
./set-env.sh dev
# regenerate the collection + envs after an API change
node generate.mjs
```

## Status & gaps

<span class="pill partial">Active · prod env TBD</span>

- Test assertions are **2xx smoke checks only** — no schema/field validation.
- **No CI / newman automation** — it's a manual/exploratory asset.
- The **Prod** environment is unset (placeholder).

See the [Completeness Scorecard](/reference/completeness) for the rating, and
[Testing](/operations/testing) for how it fits the overall test strategy.
