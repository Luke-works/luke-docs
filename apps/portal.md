# Recipient Portal

The **Recipient Portal** (`luke-portal`) is the **recipient persona's** capability-agnostic hub. An
external recipient — a customer or client, **not** a tenant member — authenticates **once** and sees
and acts on every item assigned to them within a tenant. Forms is the first item type; signatures,
documents, and others plug in without changing the portal core.

<span class="pill partial">Partial · built green, not yet deployed</span>

> **Repository:** `luke-portal` · **Type:** Application (standalone Render static site) ·
> **Stack:** React 19 / Vite 6 / TypeScript / Tailwind v4 · **Backend module:** core-engine
> `com.luke.engine.recipient`

## Why it's separate

The recipient is a first-class persona that spans capabilities, so the portal is **not** a forms
sub-feature. It owns recipient **identity**; each capability contributes **items** through a provider
SPI. That split lets new capabilities appear in the portal by implementing one interface + one
renderer — no portal rewrite.

- **Front end** — `luke-portal`, a standalone app deployed as its **own Render static site**
  (`platform-<env>-portal`, defined in `luke-platform/render.yaml`). It calls the PUBLIC portal API
  **cross-origin at the gateway** (`VITE_PORTAL_API_URL`); `/api/public/**` is any-origin/no-cred CORS,
  so this needs no credentials.
- **Back end** — core-engine module `com.luke.engine.recipient` (kept in the monolith per the
  capability→core merge decision), which owns the account-less identity flow and aggregates items. It
  builds the `/portal` + magic-link URLs it emails from `FORMS_PORTAL_BASE_URL` (the static site's
  origin); core no longer serves the `/portal` page itself.

## Architecture

```mermaid
flowchart TB
  subgraph FE["Render static site — luke-portal"]
    P1["PortalApp<br/>identify → verify → item list → open"]
    P2["item registry<br/>type → renderer"]
    P3["FormItem<br/>(form renderer)"]
  end
  subgraph ENG["core-engine — recipient module"]
    R2["PortalController<br/>/api/public/portal/**"]
    R3["PortalService<br/>challenge · verify · magic · listItems"]
    R4["PortalTenantTokens · PortalAccessTokens"]
    R5["PortalOtpSender SPI<br/>Email · SMS(seam)"]
    R6["RecipientItemProvider SPI"]
  end
  subgraph CAP["Capabilities"]
    F1["FormRecipientItemProvider"]
    F2["PublicFormInstanceController<br/>/api/public/form-instances/**"]
  end
  P1 -->|cross-origin via gateway| R2
  P2 --> P3
  P3 -->|cross-origin via gateway| F2
  R2 --> R3
  R3 --> R4
  R3 --> R5
  R3 --> R6
  R6 --> F1
```

## Identity flow (account-less, per-tenant)

The portal is served by its own static site at **`/portal/{tenantToken}`** (SPA; `/* → /index.html`),
where `tenantToken` is a signed per-tenant handle (`PortalTenantTokens`, mirroring embed tokens — a
raw tenant id never appears). Core-engine builds that URL (and the magic-link URL) from
`FORMS_PORTAL_BASE_URL` when it emails a recipient. A recipient proves control of their email via
**one of three channels**, then a short-lived, **email-scoped session** (`PortalAccessTokens`, binds
`tenant + email + expiry`) is minted:

| Channel | How | Status |
| --- | --- | --- |
| **Email OTP** | 6-digit code mailed to the sender-asserted email; salted-hashed, expiring, attempt-capped, single-use | Live |
| **Magic link** | single-use, high-entropy link (SHA-256 at rest, atomic consume), 15-min TTL | Live |
| **SMS OTP** | same OTP over the `PortalOtpSender` SMS seam | **Seam** — refused until an SMS gateway is configured (`luke.forms.sms.enabled` + a real `SmsPortalOtpSender`) |

**Privacy invariant:** the challenge/magic-link/verify responses are **identical** in shape, status,
and latency whether or not the email has any items — no distinguishable `429`, and delivery is
dispatched off-thread — so a holder of the (shareable) tenant handle can't enumerate recipients. The
session then authorises each capability's own action surface, which validates it against the item's
tenant + recipient email (cross-tenant / cross-email access is impossible).

## Item providers — onboarding a capability

Each capability implements `RecipientItemProvider` (core-engine `com.luke.engine.recipient`):

```java
public interface RecipientItemProvider {
    String type();                                              // "form", "signature", …
    List<RecipientItem> itemsFor(String tenantId, String email); // open items, newest first
    default Optional<String> phoneFor(String tenantId, String email) { return Optional.empty(); }
}
```

`PortalService.listItems` aggregates across all providers. **Forms is the first provider**
(`FormRecipientItemProvider` → open `FormInstance`s become `"form"` items).

An open form item renders the **"Developed at Lukeflow"** badge under the form when the fill payload
says to (`showBranding`, resolved server-side against the tenant's plan) — the portal is a public form
surface like `/respond/{token}`, so a recipient sees the same attribution either way. See
[Forms](/capabilities/forms#developed-at-lukeflow-badge).

To add a capability:

1. Implement `RecipientItemProvider` in that capability's package (backend).
2. Ensure its public action surface accepts the portal session (like
   `PublicFormInstanceService.authorize()` does).
3. Add one renderer to `src/items/registry.tsx` in `luke-portal` for the new item `type`.

## Endpoints

The portal page itself is served by the static site (`/portal/{tenantToken}` → SPA). The core-engine
API surface:

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| POST | `/api/public/portal/{tenantToken}/challenge` | Email/SMS OTP challenge | Public (tenant handle) |
| POST | `/api/public/portal/{tenantToken}/magic-link` · `/magic/consume` | Request / consume magic link | Public (tenant handle) |
| POST | `/api/public/portal/{tenantToken}/verify` | Verify OTP → session | Public (tenant handle) |
| GET | `/api/public/portal/items` | List assigned open items across capabilities | Public (portal session token) |

Per-item actions run on the capability's own public surface — e.g. a form item is filled via
`/api/public/form-instances/{token}` with the portal session as the Bearer.

## Status & gaps

Built green (backend module + tests, standalone front end) and wired into the Render blueprint
(`platform-dev-portal` / `platform-qa-portal` in `luke-platform/render.yaml`). On merge, Render
builds + deploys `luke-portal` as a static site — no manual vendoring step. Deploy config: the
static site's `VITE_PORTAL_API_URL` (gateway origin) and the engine's `FORMS_PORTAL_TENANT_SECRET` /
`FORMS_PORTAL_HMAC_SECRET` (generated) + `FORMS_PORTAL_BASE_URL` (the portal site's origin). SMS is
inert until a gateway is wired.

- Cross-links: [Forms capability](/capabilities/forms) · [Core Engine](/services/core-engine)
