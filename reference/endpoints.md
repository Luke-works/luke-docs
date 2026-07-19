# REST API / Endpoint Index

A consolidated, grouped index of every HTTP endpoint exposed by the Luke services, extracted directly from the controllers in `luke-core-engine`, `luke-auth-engine`, `luke-file-proxy`, and the `luke-agents` FastAPI app (as of July 2026). Paths are relative to each service's own base URL, and the auth models referenced in the tables are defined in [Authentication & Authorization](/concepts/auth).

## Auth models

| Model | How it is enforced | Where it applies |
| --- | --- | --- |
| **Tenant** | Bearer JWT via the auth gateway; resolves a tenant + user context. Default for `/api/**` routes not otherwise marked. | Most `/api/**` engine routes |
| **Public** | Unauthenticated; any-origin CORS carve-out. Includes page shells. | `/api/public/**`, `/embed`, `/respond`, `/health`, JWKS |
| **Recipient-OTP** | Opaque per-recipient token in the path; some flows require an email one-time-passcode step before read/write. | Public form-instance + signing links |
| **Internal** | Server-to-server only; `X-Internal-Key` (`InternalAuthFilter`). Never reachable from the browser. | `/api/internal/**`, file-proxy `/internal/**` |
| **Operator-Basic** | HTTP Basic operator credential (`OperatorAuthFilter`, active only when `CAPABILITY_OPERATOR_USER` is set). Guards privileged platform-admin routes. | `/api/tenants/**`, `/api/users/**`, `/api/capabilities` writes |

> The engine's Spring security chain is `permitAll` at the framework level; authentication is layered on by dedicated servlet filters (gateway JWT, `InternalAuthFilter`, `OperatorAuthFilter`) and, for public tokens, by the token itself.

---

## Forms

Base service: `luke-core-engine`. See the [Forms deep-dive](/capabilities/forms).

### Definitions — `/api/form-definitions`

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| POST | `/api/form-definitions` | Create a form definition | Tenant |
| GET | `/api/form-definitions` | List form definitions | Tenant |
| GET | `/api/form-definitions/{id}` | Get one definition | Tenant |
| GET | `/api/form-definitions/by-code/{code}` | Look up by stable code | Tenant |
| GET | `/api/form-definitions/by-code/{code}/schema` | Published schema by code | Tenant |
| GET | `/api/form-definitions/by-code/{code}/fields` | Field contract by code | Tenant |
| GET | `/api/form-definitions/{id}/embed-token` | Get the embed token | Tenant |
| POST | `/api/form-definitions/{id}/embed-token/rotate` | Rotate the embed token | Tenant |
| PUT | `/api/form-definitions/{id}/submission-handling` | Configure inbound submission handling | Tenant |
| PUT | `/api/form-definitions/{id}/outbound-config` | Configure outbound send | Tenant |
| PATCH | `/api/form-definitions/{id}` | Update metadata | Tenant |
| PUT | `/api/form-definitions/{id}/draft` | Save working draft | Tenant |
| POST | `/api/form-definitions/{id}/versions` | Snapshot a version (check-in) | Tenant |
| GET | `/api/form-definitions/{id}/versions` | List versions | Tenant |
| GET | `/api/form-definitions/{id}/versions/{v}` | Get a version | Tenant |
| POST | `/api/form-definitions/{id}/versions/{v}/publish` | Publish a version | Tenant |
| POST | `/api/form-definitions/{id}/versions/{v}/restore` | Restore a version into draft | Tenant |
| POST | `/api/form-definitions/{id}/sign-off` | Sign off a version | Tenant |
| POST | `/api/form-definitions/{id}/checkout` | Check out (advisory lock) | Tenant |
| POST | `/api/form-definitions/{id}/release` | Release the lock | Tenant |
| POST | `/api/form-definitions/{id}/discard` | Discard working changes | Tenant |
| POST | `/api/form-definitions/{id}/clone` | Clone a definition | Tenant |
| POST | `/api/form-definitions/{id}/retire` | Retire | Tenant |
| POST | `/api/form-definitions/{id}/unretire` | Un-retire | Tenant |
| DELETE | `/api/form-definitions/{id}` | Soft-delete | Tenant |
| POST | `/api/form-definitions/{id}/restore` | Restore soft-deleted | Tenant |
| DELETE | `/api/form-definitions/{id}/purge` | Hard-delete | Tenant |
| GET | `/api/form-definitions/{id}/audit` | Audit trail | Tenant |
| POST | `/api/form-definitions/{id}/send` | Send an outbound form (OutboundSendController) | Tenant |

### Instances — `/api/form-instances`

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| POST | `/api/form-instances` | Create an instance | Tenant |
| GET | `/api/form-instances` | List instances | Tenant |
| GET | `/api/form-instances/summary` | Instance summary/counts | Tenant |
| GET | `/api/form-instances/{id}` | Get one | Tenant |
| GET | `/api/form-instances/by-token/{token}` | Look up by token | Tenant |
| PATCH | `/api/form-instances/{id}` | Update draft data | Tenant |
| PUT | `/api/form-instances/{id}/state` | Set state | Tenant |
| POST | `/api/form-instances/{id}/submit` | Submit | Tenant |
| POST | `/api/form-instances/{id}/send` | Send (outbound) | Tenant |
| POST | `/api/form-instances/{id}/cancel` | Cancel | Tenant |
| POST | `/api/form-instances/{id}/processed` | Mark processed | Tenant |
| POST | `/api/form-instances/{id}/retry-process` | Retry orchestration | Tenant |

### Form inbox / tasks

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| GET | `/api/form-inbox` | List assigned form tasks | Tenant |
| POST | `/api/form-inbox/{taskId}/complete` | Complete a form task | Tenant |

### Public / embed / recipient surface

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| GET | `/embed/{token}` | Embed page shell (HTML) | Public |
| GET | `/respond/{token}` | Outbound respond page shell (HTML, top-level) | Public |
| GET | `/api/public/embed/{token}` | Load embeddable form by embed token | Public |
| POST | `/api/public/embed/{token}/submit` | Submit an embedded form | Public |
| POST | `/api/public/form-instances/{token}/otp` | Request recipient OTP | Recipient-OTP |
| POST | `/api/public/form-instances/{token}/verify` | Verify recipient OTP | Recipient-OTP |
| GET | `/api/public/form-instances/{token}` | Load recipient instance | Recipient-OTP |
| PATCH | `/api/public/form-instances/{token}` | Save recipient draft | Recipient-OTP |
| POST | `/api/public/form-instances/{token}/submit` | Recipient submit | Recipient-OTP |

---

## Email

Base service: `luke-core-engine` (send + templates) and `luke-file-proxy` (assets). See the [Email deep-dive](/capabilities/email).

### Email send & servers

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| POST | `/api/emails` | Send an ad-hoc email | Tenant |
| POST | `/api/emails/template` | Send using a template | Tenant |
| GET | `/api/emails` | List sent emails | Tenant |
| GET | `/api/emails/{id}` | Get one | Tenant |
| POST | `/api/internal/emails` | Send (server-to-server) | Internal |
| POST | `/api/internal/emails/template` | Send templated (server-to-server) | Internal |
| POST | `/api/email-servers` | Register an SMTP/provider server | Tenant |
| GET | `/api/email-servers` | List servers | Tenant |
| POST | `/api/email-verification/start` | Start sender-address verification | Tenant |
| POST | `/api/email-verification/verify` | Complete verification | Tenant |
| GET | `/api/email-verification` | Verification status | Tenant |
| GET | `/api/public/meta/free-email-domains` | Free-domain reference list | Public |

### Templates — `/api/email-templates`

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| POST | `/api/email-templates` | Create a template | Tenant |
| GET | `/api/email-templates` | List | Tenant |
| GET | `/api/email-templates/{id}` | Get one | Tenant |
| PATCH | `/api/email-templates/{id}` | Update metadata | Tenant |
| PUT | `/api/email-templates/{id}/draft` | Save draft | Tenant |
| POST | `/api/email-templates/{id}/versions` | Snapshot version | Tenant |
| GET | `/api/email-templates/{id}/versions` | List versions | Tenant |
| POST | `/api/email-templates/{id}/versions/{v}/publish` | Publish version | Tenant |
| POST | `/api/email-templates/{id}/retire` | Retire | Tenant |
| POST | `/api/email-templates/{id}/unretire` | Un-retire | Tenant |
| DELETE | `/api/email-templates/{id}` | Soft-delete | Tenant |
| POST | `/api/email-templates/{id}/restore` | Restore | Tenant |
| DELETE | `/api/email-templates/{id}/purge` | Hard-delete | Tenant |
| POST | `/api/email-templates/{id}/clone` | Clone | Tenant |
| GET | `/api/email-templates/{id}/audit` | Audit trail | Tenant |
| POST | `/api/email-templates/{id}/send-test` | Send a test email | Tenant |

### Email assets

| Method | Path | Purpose | Auth | Service |
| --- | --- | --- | --- | --- |
| POST | `/api/internal/email-assets/authorize` | Authorize an asset upload | Internal | core-engine |
| POST | `/api/internal/email-assets/{assetId}/finalize` | Finalize upload | Internal | core-engine |
| POST | `/api/internal/email-assets/public/{assetId}/resolve` | Resolve a public asset | Internal | core-engine |
| POST | `/api/email-assets` | Upload email asset (multipart) | Tenant | file-proxy |
| GET | `/api/public/email-assets/{assetId}` | Fetch a public email asset | Public | file-proxy |

---

## Signatures

Base service: `luke-core-engine`. See the [Signatures deep-dive](/capabilities/signatures).

### Definitions — `/api/signature-definitions`

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| GET | `/api/signature-definitions` | List | Tenant |
| POST | `/api/signature-definitions` | Create | Tenant |
| GET | `/api/signature-definitions/{id}` | Get one | Tenant |
| PATCH | `/api/signature-definitions/{id}` | Update metadata | Tenant |
| DELETE | `/api/signature-definitions/{id}` | Soft-delete | Tenant |
| PUT | `/api/signature-definitions/{id}/draft` | Save draft | Tenant |
| POST | `/api/signature-definitions/{id}/versions` | Snapshot version | Tenant |
| GET | `/api/signature-definitions/{id}/versions` | List versions | Tenant |
| GET | `/api/signature-definitions/{id}/versions/{v}` | Get version | Tenant |
| POST | `/api/signature-definitions/{id}/versions/{v}/publish` | Publish version | Tenant |
| POST | `/api/signature-definitions/{id}/versions/{v}/restore` | Restore version | Tenant |
| POST | `/api/signature-definitions/{id}/sign-off` | Sign off | Tenant |
| POST | `/api/signature-definitions/{id}/checkout` | Check out | Tenant |
| POST | `/api/signature-definitions/{id}/release` | Release lock | Tenant |
| POST | `/api/signature-definitions/{id}/discard` | Discard changes | Tenant |
| POST | `/api/signature-definitions/{id}/retire` | Retire | Tenant |
| POST | `/api/signature-definitions/{id}/unretire` | Un-retire | Tenant |
| POST | `/api/signature-definitions/{id}/restore` | Restore soft-deleted | Tenant |
| DELETE | `/api/signature-definitions/{id}/purge` | Hard-delete | Tenant |
| GET | `/api/signature-definitions/{id}/audit` | Audit trail | Tenant |
| POST | `/api/signature-definitions/{id}/document` | Upload source PDF (multipart) | Tenant |
| GET | `/api/signature-definitions/{id}/document/{key}` | Fetch source document | Tenant |

### Instances — `/api/signature-instances`

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| POST | `/api/signature-instances` | Create a signing instance | Tenant |
| GET | `/api/signature-instances` | List | Tenant |
| GET | `/api/signature-instances/{id}` | Get one | Tenant |
| POST | `/api/signature-instances/{id}/cancel` | Cancel | Tenant |
| GET | `/api/signature-instances/{id}/signed.pdf` | Download signed PDF | Tenant |
| POST | `/api/signature-instances/{id}/seal` | Seal / finalize | Tenant |
| POST | `/api/signature-instances/{id}/recipients/{signerId}/remind` | Re-send reminder | Tenant |

### Legacy single-shot — `/api/signatures`

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| POST | `/api/signatures` | Create from uploaded PDF (multipart) | Tenant |
| GET | `/api/signatures` | List | Tenant |
| GET | `/api/signatures/{id}` | Get one | Tenant |
| POST | `/api/signatures/{id}/send` | Send for signature | Tenant |
| GET | `/api/signatures/{id}/signed.pdf` | Download signed PDF | Tenant |
| POST | `/api/signatures/{id}/void` | Void | Tenant |

### Public signing surface

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| GET | `/api/public/sign/{token}` | Load a signing session (legacy) | Recipient-OTP |
| POST | `/api/public/sign/{token}` | Submit signature (legacy) | Recipient-OTP |
| GET | `/api/public/sign-instance/{token}` | Load instance signing session | Recipient-OTP |
| POST | `/api/public/sign-instance/{token}` | Submit signature | Recipient-OTP |

---

## Phone

Base service: `luke-core-engine`. See the [Phone deep-dive](/capabilities/phone).

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| POST | `/api/phone-calls` | Place / schedule a call | Tenant |
| GET | `/api/phone-calls` | List calls | Tenant |
| GET | `/api/phone-calls/{id}` | Get one call | Tenant |
| POST | `/api/phone-numbers` | Provision a number | Tenant |
| GET | `/api/phone-numbers` | List numbers | Tenant |
| GET | `/api/phone-numbers/{id}` | Get one number | Tenant |
| GET | `/api/phone-settings` | Get phone settings | Tenant |
| PUT | `/api/phone-settings` | Update settings | Tenant |
| POST | `/api/phone-settings/api-key` | Set provider API key | Tenant |
| DELETE | `/api/phone-settings/api-key` | Clear provider API key | Tenant |
| POST | `/api/internal/phone-calls` | Create a call (server-to-server) | Internal |
| POST | `/api/public/phone/webhook` | Vapi provider webhook (verified via `X-Vapi-Secret`) | Public |

---

## Documents

Documents are stored via `luke-file-proxy` brokers, with the core-engine holding the tenant-scoped registry. See the [Documents deep-dive](/capabilities/documents).

### core-engine registry — `/api/internal/documents`

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| POST | `/api/internal/documents/authorize` | Authorize an upload | Internal |
| POST | `/api/internal/documents/{docId}/finalize` | Finalize an upload | Internal |
| POST | `/api/internal/documents/process-started` | Bind docs to a started process | Internal |
| POST | `/api/internal/documents/{docId}/resolve` | Resolve download URL | Internal |
| GET | `/api/internal/documents/{docId}` | Get metadata | Internal |
| GET | `/api/internal/documents` | List documents | Internal |
| DELETE | `/api/internal/documents/{docId}` | Delete | Internal |
| POST | `/api/internal/documents/public/authorize` | Authorize a public/embed doc | Internal |
| POST | `/api/internal/documents/public/{docId}/finalize` | Finalize public doc | Internal |
| GET | `/api/internal/documents/public` | List public docs | Internal |
| DELETE | `/api/internal/documents/public/{docId}` | Delete public doc | Internal |
| POST | `/api/internal/documents/public/link` | Link a public doc | Internal |

### file-proxy brokers

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| POST | `/api/documents` | Upload document (multipart, presigned broker) | Tenant |
| GET | `/api/documents` | List | Tenant |
| GET | `/api/documents/{docId}` | Get metadata | Tenant |
| GET | `/api/documents/{docId}/content` | Stream content | Tenant |
| POST | `/api/documents/process-started` | Bind docs to a process | Tenant |
| DELETE | `/api/documents/{docId}` | Delete | Tenant |
| POST | `/api/public/documents` | Upload from embed context (multipart) | Public |
| GET | `/api/public/documents` | List public docs | Public |
| DELETE | `/api/public/documents/{docId}` | Delete public doc | Public |
| POST | `/api/public/documents/link` | Link public doc | Public |
| POST | `/internal/render/form-pdf` | Headless-Chromium render of a form to PDF | Internal |
| GET | `/health` | Liveness | Public |

---

## Access, Capabilities & Subscriptions

Base service: `luke-core-engine`. See the [Access deep-dive](/capabilities/access).

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| GET | `/api/my-capabilities` | Capabilities granted to the caller | Tenant |
| GET | `/api/my-subscriptions` | Caller's tenant subscriptions | Tenant |
| GET | `/api/capabilities` | Global capability catalog | Public |
| GET | `/api/capabilities/{code}` | One catalog entry | Public |
| POST | `/api/capabilities` | Create catalog entry | Operator-Basic |
| PUT | `/api/capabilities/{code}` | Update catalog entry | Operator-Basic |
| DELETE | `/api/capabilities/{code}` | Delete catalog entry | Operator-Basic |
| GET | `/api/tenants/{tenantId}/capabilities` | Tenant subscriptions | Operator-Basic |
| PUT | `/api/tenants/{tenantId}/capabilities/{code}` | Subscribe tenant | Operator-Basic |
| DELETE | `/api/tenants/{tenantId}/capabilities/{code}` | Unsubscribe tenant | Operator-Basic |
| GET | `/api/tenants/{tenantId}/users/{userId}/capabilities` | User grants | Operator-Basic |
| PUT | `/api/tenants/{tenantId}/users/{userId}/capabilities/{code}` | Grant to user | Operator-Basic |
| DELETE | `/api/tenants/{tenantId}/users/{userId}/capabilities/{code}` | Revoke from user | Operator-Basic |
| DELETE | `/api/tenants/{tenantId}` | Purge a tenant (platform admin) | Operator-Basic |
| DELETE | `/api/users/{userId}` | Purge a user's grants platform-wide | Operator-Basic |
| POST | `/api/access-requests` | Request capability access | Tenant |
| GET | `/api/my-access-requests` | Caller's requests | Tenant |
| POST | `/api/access-requests/{id}/cancel` | Cancel own request | Tenant |
| GET | `/api/org/access-requests` | Pending requests for approvers | Tenant (org-admin) |
| POST | `/api/org/access-requests/{id}/approve` | Approve (auto-grants) | Tenant (org-admin) |
| POST | `/api/org/access-requests/{id}/deny` | Deny | Tenant (org-admin) |
| POST | `/api/minions/{minion}` | Invoke a capability "minion" action | Tenant |
| POST | `/api/public/minions/{token}/{minion}` | Invoke a minion from a public/recipient context | Public |
| PUT | `/api/internal/secrets/{tenantId}/{name}` | Store a tenant secret | Internal |
| GET | `/api/internal/secrets/{tenantId}/{name}` | Read a secret | Internal |
| GET | `/api/internal/secrets/{tenantId}` | List secrets | Internal |
| DELETE | `/api/internal/secrets/{tenantId}/{name}` | Delete a secret | Internal |

---

## Calendars / SLA

No engine controllers exist for calendars or SLA scheduling. This surface is currently **UI-only** — see [Calendar deep-dive](/capabilities/calendar). See the [Coverage note](#coverage-note).

---

## Tenancy, Admin & Process

Base service: `luke-core-engine`. See [Tenancy](/concepts/tenancy).

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| GET | `/api/me` | Current user profile + context | Tenant |
| GET | `/api/me/permissions` | Effective permissions | Tenant |
| DELETE | `/api/me/account` | Self-service account deletion | Tenant |
| POST | `/api/organizations` | Create an organization | Tenant |
| POST | `/api/admin/onboard-user` | Onboard an engine user | Tenant (authorized caller) |
| POST | `/api/admin/onboard-clerk-user` | Onboard a Clerk-authenticated user | Tenant (authorized caller) |
| GET | `/api/org/users` | List org users | Tenant (org-admin) |
| POST | `/api/org/users` | Add a user | Tenant (org-admin) |
| PUT | `/api/org/users/{userId}/profile` | Update profile | Tenant (org-admin) |
| PUT | `/api/org/users/{userId}/roles/{role}` | Assign role | Tenant (org-admin) |
| DELETE | `/api/org/users/{userId}/roles/{role}` | *(revoke — see candidate-group/capability variants)* | Tenant (org-admin) |
| GET | `/api/org/candidate-groups` | List candidate groups | Tenant (org-admin) |
| POST | `/api/org/candidate-groups` | Create group | Tenant (org-admin) |
| PUT | `/api/org/candidate-groups/{groupId}` | Update group | Tenant (org-admin) |
| DELETE | `/api/org/candidate-groups/{groupId}` | Delete group | Tenant (org-admin) |
| PUT | `/api/org/users/{userId}/candidate-groups/{groupId}` | Add user to group | Tenant (org-admin) |
| DELETE | `/api/org/users/{userId}/candidate-groups/{groupId}` | Remove user from group | Tenant (org-admin) |
| GET | `/api/org/candidate-groups/{groupId}/managers` | List group managers | Tenant (org-admin) |
| PUT | `/api/org/candidate-groups/{groupId}/managers/{userId}` | Add manager | Tenant (org-admin) |
| DELETE | `/api/org/candidate-groups/{groupId}/managers/{userId}` | Remove manager | Tenant (org-admin) |
| GET | `/api/org/capabilities` | Org capability view | Tenant (org-admin) |
| GET | `/api/org/users/{userId}/capabilities` | User capabilities | Tenant (org-admin) |
| PUT | `/api/org/users/{userId}/capabilities/{code}` | Grant capability to user | Tenant (org-admin) |
| GET | `/api/tenancy/metrics` | Tenancy metrics | Tenant |
| GET | `/api/topics` | List orchestration topics | Tenant |
| GET | `/api/topics/{id}` | Get topic | Tenant |
| POST | `/api/topics` | Create topic | Tenant |
| PUT | `/api/topics/{id}` | Update topic | Tenant |
| DELETE | `/api/topics/{id}` | Delete topic | Tenant |
| GET | `/api/topics/validate` | Validate a topic expression | Tenant |
| GET | `/api/process-trace/{processInstanceId}` | Process execution trace | Tenant |
| POST | `/api/internal/process-start` | Start a process (server-to-server) | Internal |

---

## Workflow & Integrations

Base service: `luke-core-engine`. The WORKFLOW capability is hidden behind a launch flag but the controllers are live. See the [Workflow deep-dive](/capabilities/workflow).

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| POST | `/api/workflow/definitions` | Create workflow definition | Tenant |
| GET | `/api/workflow/definitions` | List | Tenant |
| GET | `/api/workflow/definitions/{id}` | Get one | Tenant |
| GET | `/api/workflow/definitions/{id}/versions` | List versions | Tenant |
| PUT | `/api/workflow/definitions/{id}` | Update | Tenant |
| POST | `/api/workflow/definitions/{id}/check-in` | Snapshot version | Tenant |
| POST | `/api/workflow/definitions/{id}/versions/{version}/sign-off` | Sign off version | Tenant |
| POST | `/api/workflow/definitions/{id}/publish` | Publish | Tenant |
| GET | `/api/workflow/catalog` | Step/capability catalog | Tenant |
| POST | `/api/workflow/definitions/{id}/runs` | Start a run | Tenant |
| GET | `/api/workflow/definitions/{id}/runs` | List runs | Tenant |
| GET | `/api/workflow/runs/{instanceId}` | Get run detail | Tenant |
| POST | `/api/workflow/runs/{instanceId}/retry` | Retry run | Tenant |
| POST | `/api/workflow/runs/{instanceId}/cancel` | Cancel run | Tenant |
| POST | `/api/workflow/integrations/{provider}/connect` | Start a Nango connect flow | Tenant |
| GET | `/api/workflow/integrations/connections` | List connections | Tenant |
| GET | `/api/workflow/integrations/connections/{id}` | Get connection | Tenant |
| DELETE | `/api/workflow/integrations/connections/{id}` | Delete connection | Tenant |
| POST | `/api/public/integrations/nango/webhook` | Nango provider webhook | Public |

---

## Auth gateway (`luke-auth-engine`)

Base service: `luke-auth-engine`. The gateway authenticates and then proxies `/**` to core-engine. See [Authentication & Authorization](/concepts/auth).

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| POST | `/auth/register` | Register a user | Public |
| POST | `/auth/login` | Password login | Public |
| GET | `/auth/social` | Begin social login | Public |
| GET | `/auth/callback` | OAuth/social callback | Public |
| POST | `/auth/refresh` | Refresh tokens | Public (refresh token) |
| POST | `/auth/logout` | Logout | Tenant |
| PATCH | `/auth/profile` | Update profile | Tenant |
| POST | `/auth/password` | Change password | Tenant |
| DELETE | `/auth/account` | Delete account | Tenant |
| POST | `/auth/org/invitations` | Create org invitation | Tenant (org-admin) |
| GET | `/auth/org/invitations` | List invitations | Tenant (org-admin) |
| POST | `/auth/org/invitations/{id}/revoke` | Revoke invitation | Tenant (org-admin) |
| POST | `/auth/org/members` | Add org member | Tenant (org-admin) |
| POST | `/service/token` | Mint a service token | Service key |
| POST | `/service/keys/{keyId}/revoke` | Revoke a service key | Service key |
| POST | `/service/keys/{keyId}/unrevoke` | Un-revoke a service key | Service key |
| GET | `/.well-known/jwks.json` | Public signing keys | Public |
| GET | `/session` | Current session info | Tenant |
| GET | `/dev/token` | Mint a dev token (non-prod only) | Public (dev) |
| ANY | `/**` | Authenticated reverse-proxy to core-engine | Tenant |

---

## Agents (`luke-agents`, FastAPI)

Base service: `luke-agents`. Each agent's router is mounted under `/agents/<slug>`, and the **default** agent is additionally mounted at the root so single-agent clients keep working. Every agent route is behind an API-key gate (`AGENTS_API_KEY`); `GET /health` and `GET /` are open by design. See the [luke-agents skill / fleet notes].

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| GET | `/health` | Active brain + mounted agents | Open |
| GET | `/` | HTML index of mounted agents | Open |
| POST | `/agents/form/chat` | Form-builder chat (LukeBuilds) | API-key |
| POST | `/agents/form/testdata` | Generate form test data | API-key |
| POST | `/agents/form/feedback` | Submit form-agent feedback | API-key |
| POST | `/agents/email/chat` | Email-template chat (LukeMail) | API-key |
| POST | `/agents/email/testdata` | Generate email test data | API-key |
| POST | `/agents/workflow/chat` | Workflow-builder chat (LukeFlow) | API-key |
| POST | `/agents/sentiment/analyze` | Analyze one text (LukeSense) | API-key |
| POST | `/agents/sentiment/batch` | Analyze a batch | API-key |
| POST | `/agents/sentiment/intake` | Structured intake analysis | API-key |
| POST | `/<default-agent routes>` | Default agent's routes also mounted at root (e.g. `POST /chat`) | API-key |

---

## Coverage note

These areas were scanned and had **no dedicated REST controllers** as of July 2026:

- **Calendars / SLA** — no controllers in any engine; the calendar surface is UI-only (see [Calendar deep-dive](/capabilities/calendar)).
- **`luke-capability-engine`** — merged into `luke-core-engine`; all of its endpoints now live under the core-engine sections above (Forms, Email, Signatures, Phone, Access, Workflow).
- **`luke-signature-engine` / `luke-task-engine`** — not scanned as separate HTTP surfaces here; the signing endpoints that ship today are served by core-engine (see [Signatures](#signatures)).

Everything listed above was extracted directly from `@RestController` classes (or FastAPI routers) in the source tree — no endpoints were inferred beyond the routes actually present.
