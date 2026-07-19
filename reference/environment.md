# Environment Variables

Every Luke service is configured entirely through **environment variables** — there
are no per-environment config files baked into the images. Spring services read
`${VAR:default}` placeholders from their `application*.yml`; the Vite UIs inline
`VITE_*` variables at **build** time; the Python agents fleet reads `os.getenv(...)`.
Sensible local-dev defaults let each service boot with **zero** configuration, and
production values are injected by the Render Blueprint (see
[Deployment Topology](/concepts/deployment)).

This page is a factual, per-service reference of the variables each service reads,
their defaults where one exists, and whether the value is a **secret**. It reflects
the fleet as of **July 2026**.

::: warning Fail-fast production guards
Several services refuse to boot if a required secret is missing or left at an
insecure development default. These guards run **only** under the production Spring
profile (`SPRING_PROFILES_ACTIVE=postgres,prod` for core-engine) or when a service is
explicitly told it is in production (`AGENTS_ENV=production`):

- **core-engine** — the `prod` profile activates guards such as **`H2ConsoleGuard`**
  (refuses boot if the H2 console is enabled) and the insecure-key checks over the
  HMAC / secret-store master keys left at their `*-change-me` defaults.
- **auth-engine** — **`DevModeGuard`** refuses boot if `LUKE_AUTH_DEV_MODE=true`
  without the `dev` Spring profile, so a single env var can never open the dev
  backdoors in a shared/prod environment. Related guards enforce a stable gateway
  signing key and reject `WORKOS_MARK_EMAIL_VERIFIED=true` outside dev-mode.
- **luke-agents** — with `AGENTS_ENV=production` the app **refuses to start** unless
  it is locked down: `AGENTS_API_KEY` set, `AGENTS_CORS` not `*`, and
  `AGENTS_REQUIRE_TENANT=true`.

Leave these guards' variables at their defaults for local development; set the
hardened values in qa/uat/prod. See [Security](/operations/security) for the full
threat model.
:::

---

## Core Engine

The [Core Engine](/services/core-engine) is the largest surface — it embeds the
FluxNova/Camunda-7 engine plus the merged capability data layer (forms, email,
signatures, documents, phone, workflow, embed, secrets). Local dev runs on H2 with
no setup; production activates the `postgres,prod` profiles.

### Runtime & database

| Variable | Purpose | Default | Secret? |
| --- | --- | --- | --- |
| `PORT` | HTTP listen port (Render injects this) | `8080` | No |
| `SPRING_PROFILES_ACTIVE` | Activate profiles; use `postgres,prod` in production | *(none → H2 dev)* | No |
| `DB_URL` | Full JDBC URL (wins over host/port fields) | H2 file `./luke-data/luke-engine` | No |
| `DB_USERNAME` | Database user | `sa` (H2) / `luke` (postgres) | No |
| `DB_PASSWORD` | Database password | *(empty)* / `luke` | **Yes** |
| `DB_DRIVER` | JDBC driver class | `org.h2.Driver` | No |
| `POSTGRES_HOST` | Postgres host (when `DB_URL` unset) | `localhost` | No |
| `POSTGRES_PORT` | Postgres port | `5432` | No |
| `POSTGRES_DATABASE` | Postgres database name | `luke_camunda` | No |
| `DB_SCHEMA` | Per-env schema for shared-Postgres isolation | `public` | No |
| `H2_CONSOLE_ENABLED` | Enable the H2 SQL console (dev only; `H2ConsoleGuard` blocks under `prod`) | `false` | No |

### Camunda / FluxNova engine

| Variable | Purpose | Default | Secret? |
| --- | --- | --- | --- |
| `CAMUNDA_ADMIN_USER` | Bootstrap admin user id | `admin` | No |
| `CAMUNDA_ADMIN_PASSWORD` | Bootstrap admin password | `admin` | **Yes** |

### Tenancy, auth & internal wiring

| Variable | Purpose | Default | Secret? |
| --- | --- | --- | --- |
| `LUKE_PARENT_CLUSTER_ID` | Operations ("parent cluster") tenant id | `parent_cluster` | No |
| `LUKE_PARENT_CLUSTER_NAME` | Parent-cluster display name | `Parent Cluster` | No |
| `ALLOWED_ORIGINS` | Comma-separated CORS origin patterns | `http://localhost:*` | No |
| `LUKE_INTERNAL_SHARED_SECRET` | Shared secret guarding `/api/internal/**` (must match callers) | *(unset → 403 all)* | **Yes** |
| `LUKE_AUTH_GATEWAY_ENABLED` | Accept gateway-signed act-as Bearer tokens on `/engine-rest/*` | `false` | No |
| `LUKE_AUTH_GATEWAY_JWKS_URL` | JWKS URL to verify gateway tokens | *(unset)* | No |
| `LUKE_AUTH_GATEWAY_ISSUER` | Expected token issuer | `luke-auth-engine` | No |
| `LUKE_AUTH_GATEWAY_AUDIENCE` | Expected token audience | `luke-core-engine` | No |
| `CAPABILITIES_BASE_URL` | Capability-engine base URL (legacy; merged in-process) | `http://localhost:8082` | No |
| `CORE_ENGINE_BASE_URL` | Self base URL for form process-start path | `http://localhost:8080` | No |
| `CAPABILITY_OPERATOR_USER` | Operator user for capability admin routes | *(unset → open)* | No |
| `CAPABILITY_OPERATOR_PASSWORD` | Operator password for capability admin routes | *(unset)* | **Yes** |

### Forms & render

| Variable | Purpose | Default | Secret? |
| --- | --- | --- | --- |
| `FORMS_PUBLIC_BASE_URL` | Public origin for outbound recipient links | `http://localhost:8080` | No |
| `FORMS_RECIPIENT_HMAC_SECRET` | HMAC secret for recipient fill-session tokens | `dev-recipient-secret-change-me` | **Yes** |
| `FORMS_RECIPIENT_SESSION_TTL_MS` | Recipient fill-session TTL | `1800000` | No |
| `LUKE_FORMS_INTAKE_PROCESS_KEY` | BPMN key started per form submission | `FormSubmissionIntakeProcess` | No |
| `LUKE_FORMS_SUBMISSION_PDF_ENABLED` | Global kill-switch for submission-PDF render | `true` | No |
| `LUKE_RENDER_URL` | file-proxy headless-Chromium render base URL (unset → skip PDF) | *(unset)* | No |

### Embed & secrets store

| Variable | Purpose | Default | Secret? |
| --- | --- | --- | --- |
| `LUKE_EMBED_HMAC_SECRET` | HMAC secret for public embed tokens | `dev-embed-secret-change-me` | **Yes** |
| `LUKE_SECRETS_ACTIVE_KEY_ID` | Active AES-256-GCM key id | `dev` | No |
| `LUKE_SECRETS_KEY_DEV` | AES-256-GCM master key material | `dev-secrets-master-key-change-me` | **Yes** |

### Email (Postmark)

| Variable | Purpose | Default | Secret? |
| --- | --- | --- | --- |
| `POSTMARK_BASE_URL` | Postmark API base URL | `https://api.postmarkapp.com` | No |
| `POSTMARK_ACCOUNT_TOKEN` | Postmark account-level token | *(unset)* | **Yes** |
| `POSTMARK_SERVER_TOKEN` | Postmark server token | *(unset)* | **Yes** |
| `EMAIL_DEFAULT_FROM` | Default From address | *(unset)* | No |
| `POSTMARK_MESSAGE_STREAM` | Message stream | `outbound` | No |
| `EMAIL_SENDER_BASE_DOMAIN` | Sending base domain | *(unset)* | No |
| `EMAIL_SENDER_DEFAULT_LOCAL_PART` | Default local-part | `no-reply` | No |
| `EMAIL_VERIFICATION_CODE_LENGTH` | OTP code length | `6` | No |
| `EMAIL_VERIFICATION_TTL_SECONDS` | OTP validity window | `600` | No |
| `EMAIL_VERIFICATION_MAX_ATTEMPTS` | Max OTP attempts | `5` | No |
| `OTP_TEMPLATE_ALIAS` | Postmark template alias for OTP email | `luke-otp` | No |
| `EMAIL_PRODUCT_NAME` | Brand name merged into OTP email | `Lukeflow` | No |

### Signatures (PAdES e-sign)

| Variable | Purpose | Default | Secret? |
| --- | --- | --- | --- |
| `SIGN_PUBLIC_BASE_URL` | Public base for `/sign/:token` links | `http://localhost:5173` | No |
| `LUKE_SIGN_MAX_UPLOAD` | Max PDF upload size | `25MB` | No |
| `LUKE_SIGNATURES_CEREMONY_PROCESS_KEY` | BPMN key for the signature ceremony | `SignatureCeremonyProcess` | No |
| `LUKE_SIGNATURES_OUTBOX_ENABLED` | Run the signature outbox poller (one HA node) | `true` | No |
| `LUKE_SIGNATURES_OUTBOX_POLL_MS` | Outbox poll interval | `2000` | No |
| `LUKE_SIGN_RETENTION_DAYS` | Signed-document retention window | `2555` | No |
| `LUKE_SIGN_REASON` | PAdES signature reason | `Signed via Luke e-signature` | No |
| `LUKE_SIGN_LOCATION` | PAdES signature location | *(unset)* | No |
| `LUKE_SIGN_TRUST_MODE` | `self` (ESIGN/UETA) or `qtsp` (eIDAS) | `self` | No |
| `LUKE_SIGN_TSA_ENABLED` | Enable RFC-3161 timestamping | `true` | No |
| `LUKE_SIGN_TSA_URL` | Timestamp authority URL | `http://timestamp.digicert.com` | No |
| `LUKE_SIGN_KEYSTORE_BASE64` | Base64 PKCS#12 signing keystore | *(unset)* | **Yes** |
| `LUKE_SIGN_KEYSTORE_PASSWORD` | Keystore password | *(unset)* | **Yes** |
| `LUKE_SIGN_KEY_ALIAS` | Key alias inside the keystore | *(unset)* | No |
| `LUKE_SIGN_BLOCK_IP_RISK` | CSV of IP-risk classes to hard-block | *(empty → flag only)* | No |

### Document store (S3 / blob)

| Variable | Purpose | Default | Secret? |
| --- | --- | --- | --- |
| `LUKE_DOCSTORE_PROVIDER` | `local` (file FS) or `s3` | `local` | No |
| `LUKE_DOCSTORE_LOCAL_DIR` | Local FS directory (local provider) | `./luke-data/docstore` | No |
| `LUKE_DOCSTORE_BUCKET` | Object-storage bucket | *(unset)* | No |
| `LUKE_DOCSTORE_REGION` | Bucket region | *(unset)* | No |
| `LUKE_DOCSTORE_ENDPOINT` | S3-compatible endpoint (R2/B2/MinIO) | *(unset)* | No |
| `LUKE_DOCSTORE_ACCESS_KEY` | Object-storage access key | *(unset)* | **Yes** |
| `LUKE_DOCSTORE_SECRET_KEY` | Object-storage secret key | *(unset)* | **Yes** |
| `LUKE_DOC_RETENTION_DAYS` | Default per-capability retention (0 = none) | `0` | No |
| `LUKE_DOC_RETENTION_DAYS_SIGNATURES` | Signatures retention window | `2555` | No |
| `LUKE_DOC_PURGE_ENABLED` | Enable the retention purge job (prod only) | `false` | No |
| `LUKE_DOC_PURGE_DRY_RUN` | Log-only purge (no state change) | `true` | No |
| `LUKE_DOC_PURGE_INTERVAL_MS` | Purge job interval | `86400000` | No |

### Phone (Vapi) & Workflow (Nango)

| Variable | Purpose | Default | Secret? |
| --- | --- | --- | --- |
| `VAPI_BASE_URL` | Vapi API base URL | `https://api.vapi.ai` | No |
| `VAPI_API_KEY` | Global fallback Vapi private key | *(unset)* | **Yes** |
| `VAPI_WEBHOOK_SECRET` | Shared secret echoed in `X-Vapi-Secret` | *(unset)* | **Yes** |
| `VAPI_WEBHOOK_REQUIRE_SECRET` | Reject unsigned webhooks (set true in prod) | `false` | No |
| `LUKE_PHONE_CALL_PROCESS_KEY` | BPMN key started per call | `PhoneCallProcess` | No |
| `LUKE_PHONE_OUTBOX_ENABLED` | Run the phone outbox poller (one HA node) | `true` | No |
| `LUKE_PHONE_OUTBOX_POLL_MS` | Outbox poll interval | `2000` | No |
| `NANGO_BASE_URL` | Nango API base URL | `https://api.nango.dev` | No |
| `NANGO_SECRET_KEY` | Nango platform secret key (server-only) | *(unset)* | **Yes** |
| `NANGO_MAX_CONNECTIONS_PER_TENANT` | Per-tenant active-connection quota | `25` | No |
| `NANGO_WEBHOOK_REQUIRE_SIGNATURE` | Reject unsigned webhooks (set true in prod) | `false` | No |
| `LUKE_WORKFLOW_OUTBOX_ENABLED` | Run the workflow outbox poller (one HA node) | `true` | No |
| `LUKE_WORKFLOW_OUTBOX_POLL_MS` | Outbox poll interval | `2000` | No |

---

## Auth Engine

The [Auth Engine](/services/auth-engine) is a stateless reverse-proxy / gateway that
runs WorkOS login flows and mints short-lived act-as-user tokens. It holds **no**
database.

### Runtime & upstreams

| Variable | Purpose | Default | Secret? |
| --- | --- | --- | --- |
| `PORT` | HTTP listen port | `8083` | No |
| `CORE_ENGINE_URL` | Upstream engine the gateway proxies to | `http://localhost:8080` | No |
| `FILE_PROXY_URL` | Route `/api/documents/**` to file-proxy when set | *(unset → core)* | No |
| `ALLOWED_ORIGINS` | Consumer-UI CORS origins | `http://localhost:*` | No |

### Dev-mode, rate-limit & sessions

| Variable | Purpose | Default | Secret? |
| --- | --- | --- | --- |
| `LUKE_AUTH_DEV_MODE` | Allow `X-Dev-User`/`/dev/token` (requires `dev` profile; `DevModeGuard`) | `false` | No |
| `SESSION_CACHE_TTL` | `/session` translator cache TTL (seconds) | `60` | No |
| `AUTH_RATELIMIT_MAX` | Max requests per IP+path window | `10` | No |
| `AUTH_RATELIMIT_WINDOW_SECONDS` | Rate-limit window | `60` | No |
| `AUTH_RATELIMIT_MAX_KEYS` | Max tracked rate-limit keys | `50000` | No |

### Service accounts

| Variable | Purpose | Default | Secret? |
| --- | --- | --- | --- |
| `LUKE_AUTH_SERVICE_KEYS` | CSV `key=userId` pairs (may be SHA-256 hashed, `;exp=`, `;scope=`) | *(empty)* | **Yes** |
| `LUKE_AUTH_SERVICE_OPERATOR_TOKEN` | Token enabling live key revocation | *(empty → disabled)* | **Yes** |

### WorkOS (authentication)

| Variable | Purpose | Default | Secret? |
| --- | --- | --- | --- |
| `WORKOS_CLIENT_ID` | WorkOS client id | *(unset)* | No |
| `WORKOS_API_KEY` | WorkOS API key | *(unset)* | **Yes** |
| `WORKOS_API_BASE` | WorkOS API base URL | `https://api.workos.com` | No |
| `WORKOS_JWKS_URL` | JWKS for access-token verification | *(derived from base+client)* | No |
| `WORKOS_ISSUER` | Expected token issuer | *(unset)* | No |
| `WORKOS_AUDIENCE` | Expected token audience | *(unset)* | No |
| `WORKOS_STRICT_VALIDATION` | Require issuer/audience (fail-closed) in prod | `false` | No |
| `WORKOS_REDIRECT_URI` | OAuth callback URL (must be registered) | `http://localhost:8083/auth/callback` | No |
| `WORKOS_UI_CALLBACK_URL` | UI SSO-callback the browser lands on | `http://localhost:5173/sso-callback` | No |
| `WORKOS_COOKIE_SECURE` | Mark refresh cookie `Secure` | `true` | No |
| `WORKOS_COOKIE_SAMESITE` | Refresh cookie `SameSite` | `Lax` | No |
| `WORKOS_MARK_EMAIL_VERIFIED` | DEV-ONLY: create users pre-verified (guarded) | `false` | No |

### Self-service onboarding

| Variable | Purpose | Default | Secret? |
| --- | --- | --- | --- |
| `ONBOARDING_OPERATOR_USER` | Operator user for `/api/admin/onboard-user` | *(unset → skip)* | No |
| `ONBOARDING_OPERATOR_PASSWORD` | Operator password | *(unset)* | **Yes** |
| `ONBOARDING_DEFAULT_TENANT` | Tenant new users join (blank → skip provisioning) | *(unset)* | No |
| `ONBOARDING_DEFAULT_ROLE` | Default role on provisioning | *(unset)* | No |
| `ONBOARDING_DEFAULT_ACCESS_LEVEL` | Default access level | `READ_WRITE` | No |

### Gateway signing key

| Variable | Purpose | Default | Secret? |
| --- | --- | --- | --- |
| `GATEWAY_PRIVATE_KEY` | PEM PKCS#8 RSA key signing act-as tokens (else ephemeral) | *(unset → ephemeral)* | **Yes** |
| `GATEWAY_REQUIRE_STABLE_KEY` | Require a stable key (boot fails if unset) — set true in prod | `false` | No |
| `GATEWAY_PREVIOUS_PUBLIC_KEY` | Previous PEM public key for zero-downtime rotation | *(unset)* | No |
| `GATEWAY_ISSUER` | Issuer stamped on act-as tokens | `luke-auth-engine` | No |
| `GATEWAY_AUDIENCE` | Audience stamped on act-as tokens | `luke-core-engine` | No |
| `GATEWAY_TTL_SECONDS` | Act-as token validity | `60` | No |

---

## File Proxy

The [File Proxy](/services/file-proxy) is the S3 byte-tier and headless-Chromium PDF
renderer. It reuses the same `LUKE_DOCSTORE_*` keys as core-engine so both point at
the same provisioned buckets.

| Variable | Purpose | Default | Secret? |
| --- | --- | --- | --- |
| `PORT` | HTTP listen port | `8095` | No |
| `LUKE_CORE_BASE_URL` | core-engine base URL for authZ + Document state | `http://localhost:8080` | No |
| `LUKE_INTERNAL_SHARED_SECRET` | Shared secret for core's `/api/internal/**` (match core) | *(unset)* | **Yes** |
| `LUKE_DOCSTORE_PROVIDER` | `local` or `s3` | `local` | No |
| `LUKE_DOCSTORE_LOCAL_DIR` | Local FS directory | `./luke-data/docstore` | No |
| `LUKE_DOCSTORE_BUCKET` | Object-storage bucket | *(unset)* | No |
| `LUKE_DOCSTORE_REGION` | Bucket region | *(unset)* | No |
| `LUKE_DOCSTORE_ENDPOINT` | S3-compatible endpoint | *(unset)* | No |
| `LUKE_DOCSTORE_ACCESS_KEY` | Access key | *(unset)* | **Yes** |
| `LUKE_DOCSTORE_SECRET_KEY` | Secret key | *(unset)* | **Yes** |
| `LUKE_DOCSTORE_KMS_KEY` | Optional KMS key id for SSE | *(unset)* | No |
| `LUKE_DOCSTORE_MAX_BYTES` | Broker-enforced upload cap (bytes) | `26214400` (25 MiB) | No |
| `LUKE_DOCSTORE_MAX_FILE_SIZE` | Container multipart file cap | `25MB` | No |
| `LUKE_DOCSTORE_MAX_REQUEST_SIZE` | Container multipart request cap | `30MB` | No |

---

## Agents (luke-agents)

The [Agents](/services/agents) fleet is a FastAPI + Groq multi-agent service. It reads
plain `os.getenv(...)` values (no Spring). Setting `AGENTS_ENV=production` turns on the
lockdown guard described in the warning above.

### Server & security

| Variable | Purpose | Default | Secret? |
| --- | --- | --- | --- |
| `AGENTS_ENV` | Set `production` to enforce the lockdown guard | *(unset → dev)* | No |
| `AGENTS_API_KEY` | Caller key (sent as `X-Agents-Key`); required in prod | *(unset)* | **Yes** |
| `AGENTS_CORS` | Allowed browser origins (CSV; must not be `*` in prod) | `*` | No |
| `AGENTS_REQUIRE_TENANT` | Require tenant header (behind gateway); true in prod | `false` | No |
| `AGENTS_DEFAULT_TENANT` | Fallback tenant id | `public` | No |
| `AGENTS_ACTOR` | Actor label for audit | *(unset)* | No |
| `RATE_LIMIT_MAX` | Per-caller action cap | `200` | No |
| `RATE_LIMIT_WINDOW_SECONDS` | Rate-limit window | `10800` (3h) | No |
| `REDIS_URL` | Shared rate-limit store (required multi-worker) | *(unset → per-worker)* | **Yes** |

### LLM brains

| Variable | Purpose | Default | Secret? |
| --- | --- | --- | --- |
| `AGENTS_BRAIN` | Force brain: `groq` \| `openai` \| `gemini` \| `ollama` | *(auto; Groq wins)* | No |
| `GROQ_API_KEY` | Groq API key (default brain) | *(unset)* | **Yes** |
| `GROQ_MODEL` | Groq model | `openai/gpt-oss-120b` | No |
| `GROQ_FALLBACK_MODEL` | Groq fallback model | `llama-3.3-70b-versatile` | No |
| `OPENAI_API_KEY` | OpenAI API key | *(unset)* | **Yes** |
| `OPENAI_MODEL` | OpenAI model | `gpt-5-nano` | No |
| `OPENAI_REASONING_EFFORT` | Reasoning effort (blank for nano) | *(empty)* | No |
| `GEMINI_API_KEY` | Gemini API key | *(unset)* | **Yes** |
| `GEMINI_MODEL` | Gemini model | `gemini-2.0-flash` | No |
| `OLLAMA_MODEL` | Local Ollama model (dev fallback) | `qwen2.5:7b` | No |
| `LLM_TIMEOUT_SECONDS` | Per-call LLM timeout | `30` | No |

### Sentiment agent (LukeSense)

| Variable | Purpose | Default | Secret? |
| --- | --- | --- | --- |
| `SENTIMENT_GROQ_MODEL` | Cheaper Groq model for sentiment | `llama-3.1-8b-instant` | No |
| `SENTIMENT_MODEL` | Pin a model for the active brain | *(empty)* | No |
| `SENTIMENT_BATCH_MAX` | Max texts per batch call | `50` | No |
| `SENTIMENT_DOC_CHUNK_CHARS` | Per-section chunk size for documents | `2000` | No |

### Transcripts, retention & PII

| Variable | Purpose | Default | Secret? |
| --- | --- | --- | --- |
| `DATABASE_URL` | Postgres for transcript store (unset → JSONL, dev only) | *(unset)* | **Yes** |
| `AGENTS_DB_SCHEMA` | Schema for transcript tables | `luke_agents` | No |
| `TRANSCRIPTS_ENABLED` | Record chat turns | `true` | No |
| `TRANSCRIPTS_DIR` | JSONL directory when no `DATABASE_URL` | `data/transcripts` | No |
| `AGENTS_RETENTION_DAYS` | Purge turns older than N days (0/unset = keep) | *(unset)* | No |
| `AGENTS_REDACT_PII` | Best-effort scrub of emails/phones/SSNs | `false` | No |
| `AGENTS_EXPORT_AUDIT_LOG` | JSONL path auditing fine-tune exports | *(unset)* | No |

---

## Consumer UI

The [Consumer UI](/services/core-engine) (`luke-consumer-ui`) is a Vite/React app.
`VITE_*` variables are inlined at **build** time — they are baked into the bundle,
never read at runtime, so **none of them may hold a secret**.

| Variable | Purpose | Default | Secret? |
| --- | --- | --- | --- |
| `VITE_AUTH_API_URL` | auth-engine (gateway) base URL | `http://localhost:8083` | No |
| `VITE_FORM_AGENT_URL` | luke-agents base URL (AI form builder) | `https://luke-agents.onrender.com` | No |
| `VITE_WORKFLOW_AGENT_URL` | luke-agents base URL for the workflow agent | *(falls back to `VITE_FORM_AGENT_URL`)* | No |
| `VITE_SIGNATURES_API_URL` | e-signature API base URL | `http://localhost:8090` | No |
| `VITE_WORKFLOW_ENABLED` | Reveal the hidden Workflows capability | `false` (hidden) | No |
| `VITE_FORMS_ALLOW_AUTOFILL` | Allow browser/password-manager autofill on forms | `false` (suppressed) | No |
| `VITE_SENTRY_DSN` | Sentry DSN (no-op unless set) | *(unset)* | No |
| `VITE_SENTRY_TRACES_RATE` | Sentry performance trace sample rate (0..1) | `0.1` | No |
| `VITE_RELEASE` | Release tag for Sentry events | *(unset)* | No |

---

## Core UI

The [Core UI](/services/core-engine) (`luke-core-ui`, TailAdmin operations console)
is likewise a build-time Vite app — no secrets.

| Variable | Purpose | Default | Secret? |
| --- | --- | --- | --- |
| `VITE_API_BASE_URL` | Deployed core-engine URL (empty → same-origin dev proxy) | *(empty)* | No |
| `VITE_CAMUNDA_BASE_URL` | Local dev proxy target for `/engine-rest` and `/api` | `http://localhost:8080` | No |
| `VITE_TASK_ENGINE_URL` | Task/e-sign engine URL | `http://localhost:8090` | No |
| `VITE_SENTRY_DSN` | Sentry DSN (no-op unless set) | *(unset)* | No |
| `VITE_SENTRY_TRACES_RATE` | Sentry performance trace sample rate (0..1) | `0.1` | No |
| `VITE_RELEASE` | Release tag for Sentry events | *(unset)* | No |
