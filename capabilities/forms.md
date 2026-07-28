# Forms

<span class="pill ready">Production-ready</span>

The **Forms capability** is Lukeflow's end-to-end form platform: a headless design/render/validate library (`@lukeflow/form-*`), a versioned form-management data layer inside the core engine, and public embed/respond surfaces that turn a browser submission into a running BPMN process. It spans authoring (draft → check-in → sign-off → publish), inbound collection (embed → submit → durable process start), and outbound delivery (prefill → send → OTP-gated respond), all tenant-scoped and driven by transactional outboxes so no submission or process-start intent is ever lost.

## Components at a glance

```mermaid
flowchart TB
  subgraph UI["Consumer UI (React)"]
    U1["FormBuilderPage"]
    U2["FormInbox / FormInstancesList"]
    U3["FormEmbed / FormRespond (public)"]
  end
  subgraph LIB["Library (@lukeflow/form-*)"]
    L1["form-core<br/>createFormEngine"]
    L2["form-react<br/>FormRenderer"]
    L3["form-builder<br/>FormBuilder"]
    L4["form-embed<br/>createEmbed"]
  end
  subgraph ENG["Core Engine — form module"]
    E1["FormDefinitionController"]
    E2["FormInstanceController"]
    E3["FormEmbedController (public)"]
    E4["PublicFormInstanceController"]
    E5["FormSubmissionService"]
    E6["FormSubmissionOutboxConsumer"]
    E7["FormEventPublisher"]
  end
  subgraph DATA["Data (Postgres)"]
    D1["luke_form_definitions"]
    D2["luke_form_versions"]
    D3["luke_form_instances"]
    D4["luke_form_submission_outbox"]
    D5["luke_form_event_outbox"]
  end
  U1 --> L3 --> L1
  U1 --> L2
  U3 --> L4
  U3 --> L2
  U1 --> E1
  U2 --> E2
  L4 --> E3
  U3 --> E4
  E1 --> D1
  E1 --> D2
  E2 --> D3
  E3 --> E5
  E4 --> E5
  E5 --> D3
  E5 --> D4
  E6 --> D4
  E5 --> E7 --> D5
```

## Data model

All tables live in the core engine's capability schema (`com.luke.engine.capability.form`), tenant-scoped by `tenantId`.

| Entity (table) | Key fields | Purpose |
| --- | --- | --- |
| `FormDefinition` (`luke_form_definitions`) | `id`, `@Version version`, `code` (FM-XXXX-DDMMMYY, unique per tenant), `name`, `kind` (INBOUND/OUTBOUND), `submissionHandling`, `outboundRolesJson`, `status` (DRAFT/PUBLISHED/RETIRED), `publishedVersion`, `draftSchema`, `allowedEmbedOrigins`, `embedKeyVersion`, `lockedBy`/`lockedAt`, `deletedAt`, `lastTestedAt` | The versioned, tenant-scoped form template. Editable working draft in `draftSchema`; `publishedVersion` is what consumers resolve. JPA `@Version` gives optimistic locking (concurrent draft saves → 409). |
| `FormVersion` (`luke_form_versions`) | `id`, `formId`, `version` (unique per form), `schema` (immutable), `checkedInBy`/`checkedInAt`, `signedOffAt`/`signedOffBy` | An immutable checked-in snapshot — the artifact a renderer/process resolves and never changes underneath them. Publish is gated on `signedOffAt` being set. |
| `FormInstance` (`luke_form_instances`) | `id`, `token` (unique, opaque URL handle), `definitionCode` + `version` (pinned), `state`, `prefill`/`data`/`recipient`/`context` (JSON maps), `recipientEmail`/`recipientPhone` (denormalised + indexed, kept in sync by `setRecipient`), `expiresAt`, `submittedAt` | A concrete runtime occurrence: hosted submission, prefilled invitation, or task-bound fill. `context` links back to `processInstanceId`/`taskId`/`businessKey`. The denormalised `recipientEmail` powers the portal's "forms assigned to me" query. |
| `FormSubmissionOutbox` (`luke_form_submission_outbox`) | `id`, `businessKey` (= instance id, unique/idempotent), `formInstanceId`, `processBusinessKey` (SM-…), `formDataJson`, `formMetaJson`, `status` (QUEUED/PUBLISHED/FAILED), `processInstanceId`, `retryCount` | Transactional outbox for submit → Camunda process start. Written in the same tx as the SUBMITTED state; drained off-thread. |
| `FormEventOutbox` (`luke_form_event_outbox`) | `id`, `eventType` (lower-cased state, e.g. `submitted`), `formCode`, `instanceId`, `payloadJson`, `state` (QUEUED/SENT/SKIPPED/FAILED), `retryCount` | Transactional outbox for the forms → workflow event rail. A lifecycle change enqueues a QUEUED row; the correlator starts subscribed workflows / advances waiting message catches. |
| `FormAuditEvent` (`luke_form_audit`) | `id`, `formId`, `action` (created/checked_in/tested/published/archived/…), `detail`, `actor`, `at` | Immutable activity feed for a definition's lifecycle. |
| `FormRecipientOtp` (`luke_form_recipient_otp`) | `id`, `instanceId` (unique), `codeHash`, `codeSalt`, `attempts`, `expiresAt` | One salted-SHA-256 OTP challenge for an outbound recipient; attempt-capped, expiring, never stored in the clear. |

```mermaid
erDiagram
  FormDefinition ||--o{ FormVersion : "has versions"
  FormDefinition ||--o{ FormInstance : "code+version pinned"
  FormDefinition ||--o{ FormAuditEvent : "activity"
  FormInstance ||--o| FormSubmissionOutbox : "submit to process"
  FormInstance ||--o{ FormEventOutbox : "lifecycle events"
  FormInstance ||--o| FormRecipientOtp : "outbound challenge"
```

## Design-time flow

```mermaid
sequenceDiagram
  participant B as FormBuilderPage
  participant BC as FormBuilder lib
  participant DC as FormDefinitionController
  participant DB as Definitions and Versions
  B->>DC: POST /{id}/checkout (acquire edit lock)
  DC->>DB: set lockedBy / lockedAt
  BC->>DC: PUT /{id}/draft (autosave draftSchema)
  B->>DC: POST /{id}/versions (check in)
  DC->>DB: save immutable FormVersion, release lock
  B->>DC: POST /{id}/sign-off (test passed)
  DC->>DB: FormVersion.signedOffAt, def.lastTestedAt
  B->>DC: POST /{id}/versions/{v}/publish
  DC->>DB: gate on signedOffAt, set publishedVersion
```

| Function / endpoint | What it does |
| --- | --- |
| `FormDefinitionController.create` (`POST /api/form-definitions`) | Mints a new definition with a generated `code` and `kind` (INBOUND/OUTBOUND), status DRAFT. |
| `FormDefinitionController.checkout` (`POST /{id}/checkout`) | Acquires the advisory edit lock (`lockedBy`/`lockedAt`); stale locks can be taken over. |
| `FormDefinitionController.saveDraft` (`PUT /{id}/draft`) | Persists the editable `draftSchema` (coltorapps-style JSON). `@Version` guards concurrent saves. |
| `FormDefinitionController.checkIn` (`POST /{id}/versions`) | Snapshots the draft into a new immutable `FormVersion` (`version = max+1`), releases the lock; status untouched. |
| `FormDefinitionController.signOff` (`POST /{id}/sign-off`) | Marks the latest version `signedOffAt`/`signedOffBy` and mirrors `lastTestedAt` for the "Tested" badge. |
| `FormDefinitionController.publish` (`POST /{id}/versions/{v}/publish`) | Promotes a version to live — **gated**: rejects with 409 unless the version is signed off; sets `publishedVersion` + status PUBLISHED. |
| `FormDefinitionController.restoreVersion` / `retire` / `unretire` / `clone` | Restore an old version to draft, retire/unretire the definition, or clone it. |
| `FormDefinitionController.release` / `discard` | Release the lock, or discard draft changes back to the last checked-in version. |

## Runtime flow (inbound embed → submit → task complete)

```mermaid
sequenceDiagram
  participant BR as Browser host page
  participant SDK as form-embed createEmbed
  participant EC as FormEmbedController
  participant SV as SubmissionValidator
  participant SS as FormSubmissionService
  participant OB as OutboxConsumer
  participant CAM as Camunda BPMN
  BR->>SDK: script loads, iframe /embed/{token}
  SDK->>EC: GET /api/public/embed/{token}
  EC-->>SDK: published schema + title
  BR->>EC: POST /{token}/submit (data)
  EC->>SV: clean(schema, data) strip/require/bound
  EC->>SS: submit(instance, attachmentRef)
  SS->>SS: mark SUBMITTED + enqueue outbox (1 tx)
  OB->>CAM: start intake process (off-thread)
  CAM->>CAM: WriteBackDelegate marks PROCESSED
```

| Function / endpoint | What it does |
| --- | --- |
| `createEmbed` (form-embed) | Injects a sandboxed iframe pointed at `/embed/{token}`, wires `postMessage` auto-resize (`connectEmbedFrame`), nonce-guards the channel; `autoEmbed()` scans embed script tags. |
| `EmbedPageController.page` (`GET /embed/{token}`) | Serves the engine-hosted embed HTML shell with per-form `frame-ancestors` CSP (from `allowedEmbedOrigins`, sanitized via `FrameAncestors`). |
| `FormEmbedController.render` (`GET /api/public/embed/{token}`) | Resolves the token (`EmbedFormResolver`) to the published `FormVersion.schema` + title; the signed embed token carries `embedKeyVersion` for revocation. |
| `FormEmbedController.submit` (`POST /api/public/embed/{token}/submit`) | Per-IP + per-token rate limits, `Honeypot.tripped` bot trap, `SubmissionValidator.clean` server backstop, then creates a SUBMITTED `FormInstance` and calls `FormSubmissionService.submit`. |
| `SubmissionValidator.clean` | Strips unknown fields against the schema, enforces required, bounds payload size (413), removes C0/C1 control chars — the public endpoint cannot trust the client. |
| `FormSubmissionService.submit` | In ONE transaction: sets state SUBMITTED, merges data, writes a QUEUED `FormSubmissionOutbox` row (business key = instance id → idempotent), marks `processStartStatus=QUEUED` on context. |
| `FormSubmissionOutboxConsumer.drain` | `@Scheduled` poller (`luke.forms.outbox-poll-ms`, default 2s) starts the Camunda intake process via `InternalProcessService.start`, mirrors attachments, flips the row PUBLISHED/FAILED with retry. |
| `FormEventPublisher.emit` | Enqueues a `FormEventOutbox` row (lower-cased state as `eventType`) so subscribed workflows start / waiting message catches advance. |
| `FormInstanceWriteBackDelegate.execute` | BPMN `JavaDelegate` at the intake process's write-back task — marks the originating instance PROCESSED and records `processInstanceId`; failures are logged, never rethrown. |

## Outbound forms

Outbound definitions (`kind = OUTBOUND`) are never embeddable — a preparer prefills fields and sends the form to a named recipient. Per-field roles live in `FormDefinition.outboundRolesJson` (a `{ fieldKey → role }` map where role ∈ `PREPARER | RECIPIENT | EITHER`), configured via `PUT /{id}/outbound-config`.

- `OutboundSendController.send` (`POST /api/form-definitions/{id}/send`) → `OutboundSendService.send`: creates a prefilled `FormInstance` with `recipient` identity, returns the opaque token + recipient link, and best-effort emails the recipient ("Please complete: …") — the send never fails on email.
- Recipient access is OTP-gated: `PublicFormInstanceService.requestOtp` mails a `FormRecipientOtp` code; `verify` marks the instance OPENED and mints a short-lived access token (`RecipientAccessTokens`); `render`/`save`/`submit` require it. The public API (`PublicFormInstanceController` at `/api/public/form-instances/**`) never leaks whether a token exists.

### Recipient portal (forms is the first provider)

Beyond the single-link `/respond/{token}` flow, a recipient can visit a **per-tenant portal** and see *every* open item assigned to their email — forms today, other capabilities next. The portal is a **separate, capability-agnostic surface** (core-engine module `com.luke.engine.recipient`, front-end app **[luke-portal](/apps/portal)**); it owns recipient identity, and each capability contributes items through the `RecipientItemProvider` SPI. **Forms is the first provider.**

- `FormRecipientItemProvider` maps every open outbound `FormInstance` for `(tenant, email)` into a `"form"` portal item (querying the denormalised `recipientEmail`), and supplies the recipient phone for the SMS channel. That is the only forms-specific piece.
- The portal session (`PortalAccessTokens`, email-scoped) authorises the existing forms fill surface unchanged: `PublicFormInstanceService.authorize()` accepts *either* a per-instance `RecipientAccessToken` *or* a portal session whose tenant + recipient email match — so `render`/`save`/`submit` are reused, and a session for tenant A / email X can never reach another tenant's or another email's forms.
- Outbound sends include the portal link (`/portal/{tenantToken}`) alongside the direct `/respond` link.

See **[Recipient Portal](/apps/portal)** for the identity flow (email/SMS OTP + magic link), the SPI, and the standalone app.

## Component reference

| Component | Type | Responsibility | Key methods |
| --- | --- | --- | --- |
| `FormDefinitionController` | controller | Design-time CRUD + lifecycle over definitions/versions | `create`, `saveDraft`, `checkIn`, `signOff`, `publish`, `checkout`, `clone`, `auditTrail` |
| `FormInstanceController` | controller | Authenticated instance management (internal) | `create`, `list`, `submit`, `retryProcess`, `setState`, `send`, `cancel`, `processed` |
| `FormEmbedController` | controller (public) | Inbound embed render + submit with abuse guards | `render`, `submit`, `rateLimit` |
| `PublicFormInstanceController` | controller (public) | OTP-gated recipient respond flow | `otp`, `verify`, GET/PATCH `{token}`, `submit` |
| `FormRecipientItemProvider` | provider | Forms as the first recipient-portal `RecipientItemProvider` — open instances → `"form"` items | `itemsFor`, `phoneFor` |
| `OutboundSendController` | controller | Send an outbound form to a recipient (incl. the portal link) | `send` |
| `EmbedPageController` / `RespondPageController` | controller | Serve engine-hosted `/embed` and `/respond` HTML shells with per-form CSP | `page` |
| `FormSubmissionService` | service | Durable submit → process-start bridge (outbox) | `submit`, `reEnqueue`, `enqueue` |
| `FormSubmissionOutboxConsumer` | service | Drains submission outbox, starts Camunda process | `drain`, `process` |
| `PublicFormInstanceService` | service | Recipient OTP/verify/render/save/submit | `requestOtp`, `verify`, `render`, `save`, `submit` |
| `OutboundSendService` | service | Create prefilled instance + email link | `send` |
| `SubmissionValidator` | util | Server-side validate/clean of untrusted submissions | `clean` |
| `FormEventPublisher` | service | Emit lifecycle events onto the workflow rail | `emit` |
| `EmbedFormResolver` / `EmbedTokens` / `FrameAncestors` / `Honeypot` | support | Token resolution, embed-key revocation, CSP sanitization, bot trap | `resolve`, `tripped` |
| `FormInstanceExpirySweeper` | scheduler | Sweep expired open instances to EXPIRED | `@Scheduled` sweep |
| `createFormEngine` | lib fn (form-core) | Headless form engine: dependency graph, visibility/required, validation, defaults, grids | `init`, `update`, `validate`, `getState`, `serialize` |
| `FormRenderer` / `useFormEngine` | react comp (form-react) | Renders a schema against the engine; controls, i18n, theme, sanitized HTML | render controls, `MinionProvider` |
| `FormBuilder` / `useFormBuilder` | react comp (form-builder) | Drag-drop authoring: palette, canvas, settings, problems, preview | `FormBuilderHandle`, `SettingsPanel` |
| `createEmbed` / `connectEmbedFrame` | lib fn (form-embed) | Host-page iframe embed SDK + auto-resize bridge | `createEmbed`, `autoEmbed` |
| `FormBuilderPage` / `FormInbox` / `FormInstancesList` | react page (consumer-ui) | Authoring UI + inbox/instance management | lifecycle actions, trace panel |

## Endpoints

| Method | Path | Purpose | Auth model |
| --- | --- | --- | --- |
| POST | `/api/form-definitions` | Create a definition | Tenant (`X-Tenant-Id`) |
| GET | `/api/form-definitions` · `/{id}` · `/by-code/{code}` | List / fetch definitions | Tenant |
| PUT | `/api/form-definitions/{id}/draft` | Autosave working draft | Tenant + `X-User-Id` |
| POST | `/api/form-definitions/{id}/versions` | Check in an immutable version | Tenant + user |
| POST | `/api/form-definitions/{id}/sign-off` | Sign off latest version (tested) | Tenant + user |
| POST | `/api/form-definitions/{id}/versions/{v}/publish` | Publish (gated on sign-off) | Tenant + user |
| POST | `/api/form-definitions/{id}/checkout` · `/release` · `/discard` | Edit-lock lifecycle | Tenant + user |
| PUT | `/api/form-definitions/{id}/outbound-config` | Set per-field preparer/recipient roles | Tenant |
| POST | `/api/form-definitions/{id}/send` | Send an outbound form to a recipient | Tenant |
| GET | `/api/form-definitions/{id}/embed-token` · POST `/embed-token/rotate` | Fetch / revoke embed token | Tenant |
| POST | `/api/form-instances` · GET `/` · PATCH `/{id}` · `/{id}/submit` | Internal instance management | Tenant |
| GET | `/embed/{token}` | Engine-hosted embed page (per-form CSP) | Public (origin-gated) |
| GET | `/api/public/embed/{token}` | Public render of published schema | Public (token) |
| POST | `/api/public/embed/{token}/submit` | Inbound submission → process start | Public (token, rate-limited) |
| GET | `/respond/{token}` | Engine-hosted respond page | Public |
| POST | `/api/public/form-instances/{token}/otp` · `/verify` | Recipient OTP challenge / verify | Public (token) |
| GET/PATCH/POST | `/api/public/form-instances/{token}` · `/submit` | Recipient render / autosave / submit | Public (token + access token) |
| GET | `/portal/{tenantToken}` | Engine-hosted recipient portal page | Public (origin-gated) |
| — | `/api/public/portal/**` · `/portal/{tenantToken}` | Recipient portal identity + item listing (capability-agnostic) | See [Recipient Portal](/apps/portal) |

## Status & gaps

Production-ready across authoring, inbound embed, outbound respond, and the recipient portal, all backed by transactional outboxes and per-tenant isolation. The portal's **SMS OTP** channel is wired behind a seam but inert until an SMS gateway is configured (`luke.forms.sms.enabled` + a real `SmsPortalOtpSender`); email OTP and magic link are live. See the [Completeness Scorecard](/reference/completeness) for the fleet-wide status view.

- Cross-links: [Forms library](/libraries/forms) · [Core Engine](/services/core-engine) · [Consumer UI](/apps/consumer-ui) · [Recipient Portal](/apps/portal)
