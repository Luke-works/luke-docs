# luke-docs

The **Lukeflow platform manual** — a Camunda-7-manual-style wiki documenting the whole
`luke-*` fleet: the process engine, the capability model, the services, the applications,
the headless libraries, and the operations/security program.

Built with [VitePress](https://vitepress.dev). Content is plain Markdown under the
section folders; the section tree, theme and search are configured in `.vitepress/`.

## Run it

```bash
npm install
npm run docs:dev      # local dev server with hot reload → http://localhost:5173
npm run docs:build    # static build → .vitepress/dist
npm run docs:preview   # preview the production build
```

## Structure

```
.vitepress/
  config.ts          # site config: nav, sidebar tree, search, footer
  theme/
    index.ts         # extends the default theme
    custom.css       # Camunda-style re-skin (blue links, orange accents, dense sidebar)
index.md             # home page
guide/               # Introduction, Architecture, The Fleet
concepts/            # Capabilities, Auth, Multi-Tenancy, Deployment
services/            # Core Engine, Auth Engine, File Proxy, Agents
apps/                # Consumer UI, Core UI, Marketing Site
libraries/           # Forms, Email, Signatures, Lists, Analytics, Workflow
operations/          # Platform & Deployment, Testing, Security, API Collection
reference/           # Completeness Scorecard, Glossary
```

## Editing

- Add a page: create a Markdown file in the right section folder, then add it to the
  `sidebar` in `.vitepress/config.ts`.
- Status pills: use `<span class="pill ready|partial|lib|exp">…</span>` (defined in
  `custom.css`).
- Cross-link with absolute paths, e.g. `[Core Engine](/services/core-engine)`.

**Snapshot:** this manual reflects the fleet as of **July 2026**. Keep the
[Completeness Scorecard](reference/completeness.md) current when repos change materially.
