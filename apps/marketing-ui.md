# Marketing Site

The public marketing / landing site for **Lukeflow — _An orchestrator for a better future._** A single-page React application that presents Luke's real engines (Flow, Forms, Tasks, Identity, Capabilities, Core) as one cohesive orchestration suite. It is entirely static and data-driven: all copy lives in one `content.ts` module, all visuals are CSS/SVG, and there are no image assets, backend calls, or forms to submit.

<span class="pill exp">Static site · not yet wired for deploy</span>

> **Repository:** `luke-marketing-ui` · **Type:** Application (static marketing) · **Stack:** React 19 / Vite 6 / Tailwind v4

## Overview

`luke-marketing-ui` is the top-of-funnel website — the page a prospective customer lands on before ever touching the product. Its job is purely presentational: explain what Lukeflow is, describe each engine, show how the pieces fit, and lay out pricing.

A few deliberate design choices define it:

- **Data-driven.** Products, platform capabilities, how-it-works steps, integrations, pricing plans, FAQs, and footer navigation all live in a single `src/lib/content.ts`. The React components render that data; editing the copy means editing one file.
- **Zero image assets.** Every visual — logos, product mockups, iconography — is CSS or SVG (icons from `lucide-react`), so the site stays crisp in both light and dark mode and ships tiny.
- **No fabricated claims.** By intent, the site carries no invented customers, logos, testimonials, usage metrics, uptime figures, or compliance badges. Copy describes only actual product capabilities.
- **Suite framing.** The six products map to Luke's real engines and are presented as one runtime with a shared control plane, identity, and observability.

::: info Marketing surface only
This repository renders a brochure. It does **not** authenticate users, capture leads, or call any Lukeflow API. Call-to-action buttons point at external URLs (`app.lukeflow.io`, `docs.lukeflow.io`) defined in `content.ts` — they are not wired to any live backend here.
:::

## Architecture

The app is a client-rendered SPA. `main.tsx` mounts `App`, which composes a persistent `Navbar` + `Footer` around a `react-router` v7 `<Routes>` outlet, with a `ScrollManager` handling scroll-restoration and in-page anchor jumps. Each page is assembled from reusable **section** components, and every section reads its content from `content.ts`.

| Layer | Files | Role |
|-------|-------|------|
| Pages | `Home`, `ProductsPage`, `PricingPage`, `NotFound` | Route targets (`/`, `/products`, `/pricing`, `*`) |
| Sections | `Hero`, `Suite`, `HowItWorks`, `Features`, `Integrations`, `Solutions`, `Pricing`, `FAQ`, `CTA`, `OrchestrationCard` | Composable marketing blocks assembled into pages |
| Layout | `Navbar`, `Footer`, `ScrollManager`, `ThemeToggle` | Chrome shared across all routes |
| UI primitives | `Badge`, `Button`, `Container`, `Logo`, `Reveal`, `Section` | Low-level building blocks (`Reveal` = scroll-reveal wrapper) |
| Hooks / lib | `useTheme`, `lib/content.ts`, `lib/accents.ts`, `lib/cn.ts` | Theme state, content data, per-product accent mapping, class-merge helper |

Routing is thin — four routes, no data loaders or nested layouts. `content.ts` is the center of gravity: `products[]`, `platformFeatures[]`, `steps[]`, `integrations[]`, `plans[]`, `faqs[]`, `footerNav[]`, and a `brand` object (name, tagline, `appUrl`, `docsUrl`). `accents.ts` maps each product to one of six accent colors (`brand`, `violet`, `mint`, `amber`, `sky`, `rose`).

## Key features

- **Products mega-menu.** The sticky `Navbar` opens a mega-menu listing all six engines, with a responsive mobile sheet.
- **Light / dark theme toggle.** `useTheme` persists the choice and respects the system `prefers-color-scheme` default; the whole palette is CSS-first via Tailwind v4 `@theme`.
- **Scroll-reveal animations.** The `Reveal` primitive animates sections into view and honors `prefers-reduced-motion`.
- **Pricing toggle.** Monthly / annual switch on the `Pricing` section, driving three plans (Starter, Team, Enterprise) from `plans[]`.
- **FAQ accordion.** Expand/collapse Q&A rendered from `faqs[]`.
- **Animated hero mockup.** A CSS/SVG product illustration in the hero — no image files.
- **SEO / social meta.** `index.html` ships `<title>`, `description`, `theme-color`, and Open Graph (`og:title`, `og:description`, `og:type`) tags.
- **Deep-dive products page.** `/products` renders each engine with anchor links (`/products#flow`, `#forms`, …) referenced from the footer.

## Technology

| Concern | Choice |
|---------|--------|
| Language | TypeScript (~5.7) |
| UI framework | React 19 (`react` / `react-dom` ^19.2) |
| Build tool | Vite 6 (`@vitejs/plugin-react`) |
| Styling | Tailwind CSS v4 (CSS-first `@theme`, brand `#465FFF`, Anek Telugu font) via `@tailwindcss/postcss` |
| Routing | `react-router` v7 |
| Icons | `lucide-react` |
| Class utilities | `clsx` + `tailwind-merge` |
| Persistence / backend | **None** — fully static |
| Size | ~32 source files (4 pages, ~10 section components, layout + UI primitives, one `content.ts`) |

## Local development

```bash
npm install
npm run dev      # Vite dev server on http://localhost:5173
npm run build    # tsc -b type-check, then vite build → dist/
npm run preview  # serve the production build locally
npm run lint     # eslint .
```

The `build` script runs a TypeScript project-reference type-check (`tsc -b`) before the Vite build, so a type error fails the build.

## Deployment

**There is currently no deployment.** The repository ships no CI/CD workflow, no Render blueprint or platform manifest, and no hosting configuration of any kind. A `dist/` folder exists locally (the output of a prior `npm run build`) but nothing publishes or serves it, and the external CTA URLs (`app.lukeflow.io`, `docs.lukeflow.io`) are placeholders defined in `content.ts` rather than live wiring.

Because the output is a plain static bundle, deploying is mechanically simple once decided — any static host (Render static site, Netlify, S3 + CloudFront, GitHub Pages) can serve `dist/` — but that decision and its config have not been made.

::: warning Not wired for release
This project is **not a git repository** (no `.git`), has **no CI/CD** or deploy config, and its CTAs are not connected to any backend. Treat it as an in-progress marketing surface, not a shipped site. Standing it up for release means: initialize a repo, add a host + build pipeline, and wire real destinations for the call-to-action links.
:::

## Status & gaps

The site renders and builds cleanly, but several things a production marketing site would have are absent:

- **Not a git repository.** No version control is initialized in the folder.
- **No CI/CD or deploy config.** Nothing builds, tests, or publishes automatically; hosting target is undecided.
- **CTAs not wired.** Buttons link to external placeholder URLs; there is no lead-capture form, "contact sales" flow, or trial signup connected to a backend.
- **No analytics.** No page-view, event, or conversion tracking is installed.
- **No SEO crawl files.** There is no `robots.txt` and no `sitemap.xml` (though per-page OG/meta tags are present in `index.html`).
- **Zero tests.** No unit, component, or end-to-end test coverage.

For how this app scores against the broader platform readiness checklist, see the [Completeness Scorecard](/reference/completeness).
