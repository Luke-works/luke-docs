# Completeness Scorecard

Every repository rated 0–100% across six metrics plus a holistic overall, from a
July 2026 fleet audit. Use this as the honest counterweight to any aspirational prose
elsewhere in the manual.

**Metrics:** *Feature* (scope built vs intended) · *Quality* (structure/typing) ·
*Tests* (automated coverage) · *Docs* · *CI/CD* (pipeline + deploy readiness) ·
*Hardening* (auth, errors, config, validation).

## Scores (ranked)

| # | Repo | Feat | Qual | Tests | Docs | CI/CD | Hard | **Overall** | Status |
| --- | --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | --- |
| 1 | [luke-forms](/libraries/forms) | 95 | 95 | 98 | 90 | 92 | 96 | **94** | <span class="pill ready">Ready</span> |
| 2 | [luke-email](/libraries/email) | 90 | 91 | 94 | 92 | 93 | 92 | **93** | <span class="pill lib">Library</span> |
| 3 | [luke-agents](/services/agents) | 89 | 88 | 85 | 88 | 90 | 88 | **88** | <span class="pill ready">Ready</span> |
| 4 | [luke-auth-engine](/services/auth-engine) | 90 | 88 | 85 | 82 | 85 | 92 | **88** | <span class="pill ready">Ready</span> |
| 5 | [luke-core-engine](/services/core-engine) | 90 | 88 | 86 | 83 | 89 | 91 | **88** | <span class="pill partial">Partial</span> |
| 6 | [luke-platform](/operations/platform) | 88 | 88 | 82 | 90 | 85 | 91 | **88** | <span class="pill partial">Partial</span> |
| 7 | [luke-consumer-ui](/apps/consumer-ui) | 88 | 85 | 85 | 62 | 90 | 80 | **84** | <span class="pill partial">Partial</span> |
| 8 | [luke-file-proxy](/services/file-proxy) | 85 | 88 | 62 | 55 | 80 | 87 | **82** | <span class="pill partial">Partial</span> |
| 9 | [luke-api-collection](/operations/api-collection) | 85 | 88 | 40 | 90 | 5 | 90 | **77** | <span class="pill partial">Partial</span> |
| 10 | [luke-analytics](/libraries/analytics) | 70 | 88 | 82 | 85 | 78 | 55 | **76** | <span class="pill lib">Library</span> |
| 11 | [luke-core-ui](/apps/core-ui) | 90 | 72 | 48 | 78 | 80 | 80 | **76** | <span class="pill partial">Partial</span> |
| 12 | [luke-lists](/libraries/lists) | 70 | 85 | 70 | 73 | 78 | 78 | **74** | <span class="pill lib">Library</span> |
| 13 | [luke-signatures](/libraries/signatures) | 85 | 88 | 48 | 82 | 30 | 72 | **72** | <span class="pill lib">Library</span> |
| 14 | [luke-workflow](/libraries/workflow) | 70 | 85 | 78 | 72 | 28 | 73 | **67** | <span class="pill exp">Pre-launch</span> |
| 15 | [luke-marketing-ui](/apps/marketing-ui) | 87 | 85 | 0 | 78 | 5 | 45 | **66** | <span class="pill exp">Stale</span> |
| 16 | luke-task-engine | 58 | 72 | 8 | 65 | 5 | 35 | **41** | <span class="pill exp">Experimental</span> |

*Not scored: `luke-capability-engine`, `luke-signature-engine` — empty shells merged into
[core-engine](/services/core-engine).*

**Fleet average overall ≈ 78%.**

::: tip Recent uplift
**[luke-email](/libraries/email)** was hardened to **[luke-forms](/libraries/forms) parity** (87 → 93):
an enforceable public-API-surface guard + bundle-size budget in CI, property/fuzz + injection-safety
tests (`email-core` 39 → 66 tests, the fuzz suites running 400 adversarial iterations each), and a
full docs suite (`SECURITY.md` / `docs/SECURITY.md` / `docs/USAGE.md`). It is now the fleet's #2,
second only to forms.
:::

## Tiers

- **Production-grade (85–94):** forms, agents, auth-engine, core-engine, platform, email.
- **Solid, partial (76–84):** consumer-ui, file-proxy, api-collection, analytics, core-ui, lists.
- **Emerging / pre-launch (66–74):** signatures, workflow, marketing-ui.
- **Legacy (41):** task-engine — superseded by the engine's outbox/job-worker model.

## Cross-fleet patterns

- **Hardening is a fleet-wide strength** — 85+ on every shipped service (fail-fast guards,
  tenant isolation, supply-chain scans). See [Security](/operations/security).
- **Testing is the most uneven axis** — elite on test-first libraries (forms 98, email /
  agents / analytics 82–85) but thin on UIs and some extracted libs (core-ui 48,
  signatures 48, file-proxy 62, task-engine 8, marketing-ui 0). See [Testing](/operations/testing).
- **CI gaps on three young repos** — signatures (30) and workflow (28) have release wiring
  but **no `.github/workflows`**; marketing-ui and task-engine have none either.
- **Docs weakest where scope outran the README** — consumer-ui (62) and file-proxy (55, no
  README, only a CHARTER) under-document a large built surface.

## Highest-impact fixes

1. Add a CI workflow to **luke-signatures** and **luke-workflow** — both green locally, just ungated.
2. Test coverage on **luke-core-ui** (broaden e2e) and **luke-signatures** React components (~2k LOC untested).
3. Add a **README to luke-file-proxy**; refresh the stale Clerk→WorkOS mention in **luke-auth-engine**'s README.
4. Decide **luke-task-engine**'s fate — archive or delete (superseded, dead weight).

::: info Method
Scores come from an evidence-based audit of each repo (README, build files, CI, test counts,
LOC, git recency, deploy config). They are directional engineering judgments, not a substitute
for reading the code.
:::
