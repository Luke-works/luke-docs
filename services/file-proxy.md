# File Proxy

A **thin, stateless S3 byte pipe.** It exists for one reason: keep large document
byte traffic **off the heavy [Core Engine](/services/core-engine) JVM** (FluxNova +
GraalVM) while never exposing the S3 bucket, key, region, or signature to the browser.

<span class="pill partial">Partial · deployed</span>

> **Repository:** `luke-file-proxy` · **Type:** Platform service · **Stack:** Java 21 / Spring Boot 3.4 + AWS S3 + headless Chromium

## Overview (why bytes bypass the engine)

The engine is expensive to run: it boots FluxNova (a FINOS Camunda-7 fork) on GraalVM,
carries the whole capability data layer, and owns the Postgres transaction. Streaming
multi-megabyte uploads and downloads through that same JVM would waste its heap and its
request threads on pure byte-shuffling. The File Proxy is the answer: a deliberately
minimal service that holds the S3 credentials and does **exactly two things** — receive a
multipart upload and stream it to S3, and stream an object from S3 back to the client
(Range-capable, for `react-pdf`).

Its charter is uncompromising: **no database, no persistent state, no business logic.**
It does not know what a "form" or a "signature" is. For every request it makes **one
small internal JSON call** to core-engine — *"can this principal touch this object? → ok +
storageKey"* — and the bytes themselves never travel to core. AuthZ and all document state
live in the engine; the proxy is purely a byte tier for the [Documents capability](/concepts/capabilities).

::: info The test for any change (from `CHARTER.md`)
> Does it need a database, or knowledge of a business domain?
> **Yes → it belongs in core-engine, not here.** No, it's pure byte transfer → it can live here.
:::

The one sanctioned exception to "no logic" is the **form submission-PDF renderer**: an
internal endpoint that drives headless Chromium to render the real read-only form renderer
to a pixel-faithful PDF, co-located here by explicit product decision because this tier
already owns the S3 write path.

## Architecture

The service is a handful of Spring `@RestController`s over a single `BlobStore`
abstraction. Every controller follows the same shape: **authorize with core → stream bytes
to/from S3 → finalize with core**. Bytes flow *only* through these controllers; core sees
only small JSON handshakes.

| Endpoint group | Base path | Auth model | Purpose |
| --- | --- | --- | --- |
| **Document broker (authed)** | `/api/documents` | Gateway identity headers (`X-Tenant-Id` / `X-User-Id`) | Upload / download / list / delete documents for a logged-in user; SHA-256 computed on the fly; downloads are Range-capable. |
| **Document broker (public)** | `/api/public/documents` | Embed token only (never a client-supplied tenant) | Attachment upload from embedded forms with no login; a `/link` call binds uploads to the created process instance on submit. |
| **Email-asset upload (authed)** | `/api/email-assets` | Gateway identity headers | Browser-facing upload of email images/assets to S3 (5 MiB cap — "keep emails light"). |
| **Email-asset serve (public)** | `/api/public/email-assets/{assetId}` | High-entropy asset UUID only | Durable, unauthenticated, aggressively-cacheable URL a recipient's mail client loads via `<img src>`; core resolves `READY` assets to a tenant + storage key. |
| **Form-PDF render (internal)** | `/internal/render/form-pdf` | Fail-closed internal shared secret (`X-Internal-Key`) | core-engine → proxy: render a submission to PDF via headless Chromium, store it, and report size + SHA-256 so core can finalize. Not routed by the gateway. |
| **Health** | `/health`, Actuator `health,info` | — | Liveness for Render. |

### The BlobStore abstraction

All storage goes through the `BlobStore` interface — the proxy deals in *opaque bytes*,
never "documents". The physical object key is composed as `{tenantId}/{key}`, with both
segments validated against path traversal (`StorageKeys`). The `tenantId` is always
**token-derived by core, never client-supplied.**

| Implementation | Provider | Used for |
| --- | --- | --- |
| `LocalFsBlobStore` | `provider=local` | Local development — a plain filesystem directory; Object-Lock is a no-op. |
| `S3BlobStore` | `provider=s3` | Prod — AWS S3 (or any S3-compatible endpoint: Cloudflare R2, Backblaze B2, MinIO), with optional KMS encryption and Object-Lock retention. |

Swapping between them is **config-only**. The interface exposes `putStream` (with optional
`Retention` for S3 Object Lock, computed by core and relayed on authorize), `openRead`,
`openRange`, `exists`, `size`, `delete`, and a hard `purge` that erases all versions and
delete markers.

## Key features

- **Byte traffic stays off the engine.** The heavy JVM never streams document bytes; the
  proxy holds the only S3 credentials in the fleet.
- **Token-derived tenancy.** The tenant used to build every physical S3 key comes from
  core (from the identity token or embed token), never from a client-supplied value.
- **On-the-fly SHA-256.** Uploads and rendered PDFs are digested with a
  `DigestInputStream` as they stream to S3 — no whole-file buffering in memory.
- **Fail-closed internal gate.** The render endpoint requires the shared internal secret
  (`LUKE_INTERNAL_SHARED_SECRET`), rejecting the request when the header is absent or wrong.
- **Size caps everywhere.** A servlet multipart cap (25 MiB file / 30 MiB request), a
  broker `max-bytes` cap enforced mid-stream, a 5 MiB email-asset cap, and a 2 MiB render
  schema cap so an oversized payload can't drive a huge, slow headless render.
- **Semaphore back-pressure.** The PDF renderer guards its single Chromium behind a fair
  `Semaphore` (default 3 permits). When saturated it **sheds load with `503`** ("renderer
  busy — retry shortly") rather than piling blocked threads behind the browser.
- **Prod-profile fail-fast.** `DocstoreProdGuard` refuses to boot under the dedicated
  `prod` Spring profile unless storage is real (`provider=s3`, bucket + region set) and the
  cap is sane. dev/qa (no `prod` profile) keep running the local FS store with a warning.
- **Retention relayed, not decided.** S3 Object-Lock (`COMPLIANCE` / `GOVERNANCE`) is
  computed by core and applied here — the only tier holding S3 creds.

## Technology

| Concern | Choice |
| --- | --- |
| Language / runtime | Java 21 |
| Framework | Spring Boot 3.4 (`3.4.13`) — Web + Actuator only |
| Object storage | AWS SDK for Java v2 — S3 (`2.25.60`) |
| PDF rendering | Microsoft Playwright `1.49.0` driving headless Chromium |
| Build | Maven (wrapper `mvnw`) |
| Container | Multi-stage Docker (Temurin 21; Chromium + OS libs installed via the Playwright CLI) |
| CI | GitHub Actions — `mvnw verify` on every PR and on push to `develop`/`qa` |

::: warning Deliberately minimal dependencies
Per `CHARTER.md` the dependency set is **Spring Web + AWS SDK S3 only** (plus the
sanctioned Playwright exception). **No FluxNova/Camunda, no GraalVM, no JPA, no database.**
Any change that would need one of those belongs in core-engine instead.
:::

## Local development

The proxy boots no engine, so it starts in seconds. It defaults to the local filesystem
store, so no AWS credentials are needed for day-to-day work.

```bash
# From the repo root
./mvnw spring-boot:run          # starts on http://localhost:8095 (provider=local)

# Run the test suite (fast — no Camunda/Graal to boot)
./mvnw -B -ntp verify

# Point at a live core-engine and an S3-compatible bucket
export LUKE_CORE_BASE_URL=http://localhost:8080
export LUKE_INTERNAL_SHARED_SECRET=<same value core uses>
export LUKE_DOCSTORE_PROVIDER=s3
export LUKE_DOCSTORE_BUCKET=luke-docstore-dev
export LUKE_DOCSTORE_REGION=us-east-1
export LUKE_DOCSTORE_ACCESS_KEY=... LUKE_DOCSTORE_SECRET_KEY=...
./mvnw spring-boot:run
```

Config keys keep the `LUKE_DOCSTORE_*` prefix to match the provisioned infra (the
`luke-docstore-*` buckets, per-env IAM users, and `render.yaml`), even though the code
calls the abstraction a "blob store". The env-gated S3 smoke integration test is skipped
without live credentials, so CI needs no AWS secrets.

## Deployment

The service ships as a Docker image on **Render**, from the blueprint (`render.yaml`) in
[`luke-platform`](/concepts/deployment). Render injects `$PORT` at runtime (local default
`8095`).

Because the headless Chromium renderer runs **in-process**, the container is not the tiny
512 MB byte pipe it once was — prod instances are sized up in `render.yaml` to absorb the
browser. Chromium's RSS lives outside the JVM, so the heap is deliberately capped low
(`-XX:MaxRAMPercentage=50.0`) to leave headroom and avoid container OOM. The Dockerfile
installs Chromium and its OS libraries via the Playwright CLI at build time and runs as a
non-root `luke` user.

::: tip Scale path — no new service
If download volume ever outgrows the proxy, the plan (backlog **DOC-12**) is to front S3
with **CloudFront on our own domain + signed cookies**, so downloads leave the proxy
entirely. Uploads still flow through here — a CDN can't receive an upload without exposing
S3.
:::

## Status & gaps

The service is **deployed and in active use** across the fleet's document, email-asset, and
submission-PDF paths, and it is architecturally healthy — the charter constraints keep it
small on purpose. The gaps are about documentation and test depth, not missing function.

- **README added** (82 → 85). The repo now has a comprehensive `README.md` — what it does,
  the architecture (endpoint groups, `BlobStore`, the internal core handshake), local dev,
  deployment, and hardening — alongside the design `CHARTER.md`.
- **Thin controller tests.** Roughly **23 tests** cover the render controller, the document
  and email-asset controllers, `LocalFsBlobStore`, and the prod guard; `S3BlobStore` is
  only lightly covered by an env-gated smoke integration test that CI skips without live
  credentials. The public brokers and the range/retention paths deserve deeper coverage.
- **Renderer is the load-bearing risk.** The in-process Chromium is the one heavyweight,
  memory-sensitive part; its `503`-shedding semaphore and sized-up instances mitigate but
  do not eliminate the operational cost of hosting a browser in the byte tier.

See the [Completeness Scorecard](/reference/completeness) for how File Proxy rates against
the rest of the fleet.
