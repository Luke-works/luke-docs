import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

// Luke Docs — a Camunda-7-manual-style wiki for the whole Lukeflow (luke-*) fleet.
// Snapshot date is surfaced in the footer so readers know how current the content is.
const SNAPSHOT = 'July 2026'

export default withMermaid(defineConfig({
  title: 'Luke Docs',
  description:
    'The manual for the Lukeflow platform — a multi-tenant BPMN process engine and its capability fleet (forms, email, signatures, phone, documents, access, workflow).',
  lang: 'en-US',
  cleanUrls: true,
  lastUpdated: true,
  // Pages cross-link liberally; don't fail the build on an in-progress link.
  ignoreDeadLinks: true,

  head: [
    ['meta', { name: 'theme-color', content: '#0b6bcb' }],
    ['meta', { name: 'author', content: 'Lukeflow' }],
  ],

  themeConfig: {
    logo: undefined,
    siteTitle: 'Lukeflow Manual',

    nav: [
      { text: 'Introduction', link: '/guide/introduction' },
      { text: 'Architecture', link: '/guide/architecture' },
      {
        text: 'Components',
        items: [
          { text: 'Platform Services', link: '/services/core-engine' },
          { text: 'Applications', link: '/apps/consumer-ui' },
          { text: 'Headless Libraries', link: '/libraries/forms' },
        ],
      },
      { text: 'Reference', link: '/reference/completeness' },
      { text: `Snapshot: ${SNAPSHOT}`, link: '/reference/completeness' },
    ],

    sidebar: [
      {
        text: 'Introduction',
        collapsed: false,
        items: [
          { text: 'Overview', link: '/guide/introduction' },
          { text: 'Architecture', link: '/guide/architecture' },
          { text: 'The Fleet', link: '/guide/fleet-map' },
        ],
      },
      {
        text: 'Concepts',
        collapsed: false,
        items: [
          { text: 'Capabilities', link: '/concepts/capabilities' },
          { text: 'Authentication & Authorization', link: '/concepts/auth' },
          { text: 'Multi-Tenancy', link: '/concepts/tenancy' },
          { text: 'Deployment Topology', link: '/concepts/deployment' },
        ],
      },
      {
        text: 'Capability Deep-Dives',
        collapsed: false,
        items: [
          { text: 'Forms', link: '/capabilities/forms' },
          { text: 'Email', link: '/capabilities/email' },
          { text: 'Signatures', link: '/capabilities/signatures' },
          { text: 'Phone (Voice)', link: '/capabilities/phone' },
          { text: 'Documents', link: '/capabilities/documents' },
          { text: 'Access Management', link: '/capabilities/access' },
          { text: 'Calendars & SLA', link: '/capabilities/calendar' },
          { text: 'Workflow', link: '/capabilities/workflow' },
        ],
      },
      {
        text: 'Platform Services',
        collapsed: false,
        items: [
          { text: 'Core Engine', link: '/services/core-engine' },
          { text: 'Auth Engine', link: '/services/auth-engine' },
          { text: 'File Proxy', link: '/services/file-proxy' },
          { text: 'Agents (AI)', link: '/services/agents' },
        ],
      },
      {
        text: 'Applications',
        collapsed: false,
        items: [
          { text: 'Consumer UI', link: '/apps/consumer-ui' },
          { text: 'Core UI (Cockpit)', link: '/apps/core-ui' },
          { text: 'Marketing Site', link: '/apps/marketing-ui' },
        ],
      },
      {
        text: 'Headless Libraries',
        collapsed: false,
        items: [
          { text: 'Forms', link: '/libraries/forms' },
          { text: 'Email', link: '/libraries/email' },
          { text: 'Signatures', link: '/libraries/signatures' },
          { text: 'Lists', link: '/libraries/lists' },
          { text: 'Analytics', link: '/libraries/analytics' },
          { text: 'Workflow', link: '/libraries/workflow' },
        ],
      },
      {
        text: 'Operations',
        collapsed: false,
        items: [
          { text: 'Platform & Deployment', link: '/operations/platform' },
          { text: 'Testing', link: '/operations/testing' },
          { text: 'Security', link: '/operations/security' },
          { text: 'API Collection', link: '/operations/api-collection' },
        ],
      },
      {
        text: 'Reference',
        collapsed: false,
        items: [
          { text: 'Completeness Scorecard', link: '/reference/completeness' },
          { text: 'Glossary', link: '/reference/glossary' },
        ],
      },
    ],

    search: { provider: 'local' },

    outline: { level: [2, 3], label: 'On this page' },

    docFooter: { prev: true, next: true },

    footer: {
      message: `Lukeflow Manual · documentation snapshot ${SNAPSHOT}`,
      copyright: 'Internal engineering documentation — Lukeflow',
    },
  },
}))
