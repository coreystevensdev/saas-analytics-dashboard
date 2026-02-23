# Story 7.3: README Case Study & Hero Screenshot

Status: done

<!-- Note: Validation is REQUIRED. Every story must complete all 4 steps: Create → Validate → Dev → Code Review. -->

## Story

As a **hiring manager evaluating this portfolio piece**,
I want a polished README with architecture diagram and hero screenshot,
so that I can quickly understand the project's scope and quality.

## Acceptance Criteria

1. **Given** the README scaffold from Story 1.6 exists, **when** the prose is filled in, **then** all sections have substantive content in case-study format: problem statement, solution approach, architecture diagram, tech stack rationale, and getting started instructions (FR38)

2. **Given** the hero screenshot is needed, **when** `scripts/generate-screenshots.ts` runs via Playwright, **then** a hero screenshot is generated and saved to `docs/screenshots/` showing the dashboard with seed data and AI summary

3. **Given** the README is complete, **when** a reader follows the "Getting Started" section, **then** `docker compose up` successfully launches the full application with seed data

## Tasks / Subtasks

- [x] Task 1: Create `scripts/generate-screenshots.ts` — Playwright screenshot generator (AC: #2)
  - [x] 1.1 Create the script using Playwright's API (not test runner) — `chromium.launch()`, navigate to `http://localhost:3000/dashboard`, wait for AI summary card to render, capture full-viewport screenshot
  - [x] 1.2 Capture two variants: light mode (default) and dark mode. For dark mode, set localStorage before navigation: `page.addInitScript(() => localStorage.setItem('theme', 'dark'))` — `next-themes` with `attribute="class"` reads this on hydration. `page.emulateMedia({ colorScheme: 'dark' })` alone is NOT sufficient because `next-themes` applies the `dark` class to `<html>` based on localStorage/cookie, not the CSS media query
  - [x] 1.3 Set viewport to 1280x800 for a clean desktop hero shot
  - [x] 1.4 Wait for Recharts animations to settle (500ms animation duration + buffer) and AI summary card content to be non-empty before capture
  - [x] 1.5 Save to `docs/screenshots/hero-light.png` and `docs/screenshots/hero-dark.png`
  - [x] 1.6 Add npm script: `"screenshots": "pnpm -C apps/api exec tsx ../../scripts/generate-screenshots.ts"` in root `package.json`
  - [x] 1.7 Log output paths on completion via `console.log` (this is a CLI script, not application code — Pino not required)

- [x] Task 2: Generate a Mermaid architecture diagram (AC: #1)
  - [x] 2.1 Create a Mermaid flowchart showing: Browser → Next.js BFF → Express API → PostgreSQL/Redis/Claude API, with the curation pipeline (computation → scoring → assembly) as a sub-graph
  - [x] 2.2 Embed directly in README.md using a ```mermaid fenced code block (GitHub renders natively)
  - [x] 2.3 Keep it readable — 10-15 nodes max, no implementation details

- [x] Task 3: Fill README.md case-study prose (AC: #1, #3)
  - [x] 3.1 **Overview**: 2-3 sentence elevator pitch — AI-powered analytics for small business owners, explains data in plain English, not just charts
  - [x] 3.2 **Problem**: Expand existing placeholder — small businesses can't afford data scientists, enterprise tools overwhelm non-technical users, numbers without narrative
  - [x] 3.3 **Solution**: Describe the product narrative — CSV upload → instant visualization → AI interprets trends/anomalies in plain English → share insights. Mention the "interpretation, not just visualization" thesis
  - [x] 3.4 **Architecture**: Replace ASCII art with Mermaid diagram from Task 2, add 2-3 sentences explaining BFF proxy pattern, curation pipeline privacy-by-architecture, and SSE streaming
  - [x] 3.5 **Tech Stack**: Keep existing table, add brief "Why" column with 1-line rationale for each choice
  - [x] 3.6 **Key Features**: New section — bullet list of 6-8 features (AI summaries, dark mode, sharing, Stripe billing, RLS multi-tenancy, 5-stage CI, etc.)
  - [x] 3.7 **Screenshots**: Embed hero screenshot image from `docs/screenshots/hero-light.png`, add dark mode variant below it
  - [x] 3.8 **Getting Started**: Verify `docker compose up` instructions are accurate, add env var setup notes (`.env.example` → `.env`, mention `CLAUDE_API_KEY` is optional for seed data mode)
  - [x] 3.9 **Demo**: Add a note about seed data demo mode — no account needed, pre-loaded business data with AI summary
  - [x] 3.10 **Project Structure**: Brief monorepo layout (`apps/web`, `apps/api`, `packages/shared`) with one-liner descriptions
  - [x] 3.11 Remove all `<!-- TK -->` placeholder comments

- [x] Task 4: Verify Getting Started flow (AC: #3)
  - [x] 4.1 Confirm `.env.example` exists with all required vars documented. Mark `CLAUDE_API_KEY` as optional with a comment — seed data mode works without it
  - [x] 4.2 Confirm `docker compose up` runs migrations and seeds data automatically
  - [x] 4.3 Confirm anonymous visitors see seed data dashboard without auth

## Dev Notes

### What Already Exists

**README.md (Story 1.6 scaffold):** Section headers with `<!-- TK -->` placeholders. Problem section has initial prose. Tech Stack table exists. Getting Started has basic `docker compose up` + dev commands. No screenshots, no architecture diagram, no substantive content in Overview/Solution/Demo.

**Playwright (project dep):** Already configured at `playwright.config.ts` — testDir `e2e/`, baseURL `http://localhost:3000`, Chromium project. The screenshot script uses Playwright's library API directly, not the test runner.

**`docs/screenshots/` directory:** Exists but empty. Created in Story 1.6 for this purpose.

**Dark mode (Story 7.5):** Fully implemented via `next-themes`. System preference detection, manual toggle, oklch color tokens. Screenshots should capture both modes.

**Seed data + AI summary (Stories 2.1, 3.2):** Pre-generated seed summary in `ai_summaries` table. Anonymous dashboard shows seed data charts + cached AI summary — zero LLM calls needed. This is the "hero" state to screenshot.

**Docker first-run:** Migrations + seed data run automatically via entrypoint scripts. `docker compose up` from clean state produces a working app with data.

### Architecture Compliance

**FR38:** "The system includes a README in case-study format with hero screenshot and architecture diagram." This is a Core requirement and one of three Portfolio Success gates (Docker Gate, README Gate, Deploy Gate).

**Screenshot generation (architecture doc, gap #8-9):** Playwright-based script at `scripts/generate-screenshots.ts`. Launches browser, navigates to dashboard, captures viewport. Saves to `docs/screenshots/`. Architecture explicitly calls this out as the reproducible approach — no manual screenshots.

**Privacy-by-architecture in README:** When describing the curation pipeline, mention that raw data never reaches the LLM — only computed statistics. This is the project's most interview-worthy architectural decision.

**BFF proxy pattern in README:** Mention that the browser never calls Express directly. Same-origin, no CORS. This is a deliberate architectural choice worth highlighting.

### Library/Framework Requirements

| Library | Version | Usage |
|---------|---------|-------|
| Playwright | (existing workspace dep) | Screenshot generation — library API, not test runner |
| tsx | (existing workspace dep) | TypeScript execution for the script |

**No new dependencies.** The screenshot script uses Playwright's `chromium.launch()` API. Mermaid renders natively on GitHub — no build step needed.

### File Structure Requirements

```
scripts/
  generate-screenshots.ts        ← NEW: Playwright screenshot generator
docs/
  screenshots/
    hero-light.png               ← NEW: generated hero screenshot (light mode)
    hero-dark.png                ← NEW: generated hero screenshot (dark mode)
README.md                        ← MODIFY: fill all TK placeholders with case-study prose
```

### Testing Requirements

This story is documentation and tooling — no unit tests needed. Verification is:

1. Run `scripts/generate-screenshots.ts` → screenshots appear in `docs/screenshots/`
2. Open README.md on GitHub → Mermaid diagram renders, images display, prose reads well
3. Follow Getting Started instructions from scratch → `docker compose up` works
4. No `<!-- TK -->` comments remain in README.md

### Previous Story Intelligence

**Story 7.2 (seed validation) patterns:**
- Scripts live at `scripts/` directory root
- Use `tsx` for execution: `pnpm -C apps/api exec tsx ../../scripts/validate-seed.ts`
- Path aliases (`@/`) don't work in scripts — use explicit relative imports
- `console.log` is fine in CLI scripts (not application code)

**Story 7.5 (dark mode) patterns:**
- `next-themes` with `ThemeProvider` in root layout
- `useTheme()` hook for programmatic theme switching
- `prefers-color-scheme` media query for detection
- oklch color tokens in `globals.css` via `@theme` directive

**Story 7.4 (analytics events):**
- Confirmed all 10 analytics events fire correctly
- Event names use dot-notation past tense: `dataset.uploaded`, `dashboard.viewed`, etc.

**Epic 6 retro sequencing note:** Story 7.3 was deliberately sequenced last — depends on 7.5 (dark mode must be complete for dark mode screenshots) and Playwright (available since 7.1).

### Git Intelligence

Recent commits show Epic 7 completion pattern:
- `f3a4217` — Story 7.4 code review fixes (most recent)
- `b5ba4be` — Story 7.4 analytics event implementation
- `83a0a61` — RLS gap fixes
- `2a1b5a5` — Stories 7.6 + 7.5 (RLS + dark mode)

All Epic 7 dependencies for 7.3 are complete. The codebase is stable and ready for the final documentation pass.

### DO NOT Reinvent

| What | Where | Why |
|------|-------|-----|
| Playwright config | `playwright.config.ts` | Use for baseURL — but screenshot script uses library API directly, not test runner |
| Dark mode toggle | `next-themes` + `ThemeProvider` | Already implemented — use localStorage trick for dark screenshots (see Gotchas) |
| Seed data/summary | `db/seed.ts` + `ai_summaries` table | Dashboard shows this by default for anonymous users |
| Docker first-run | `docker-compose.yml` + entrypoint scripts | Migrations + seed auto-run |
| README scaffold | `README.md` | Section structure exists — fill, don't restructure |
| Tech stack table | `README.md` | Keep existing table — add "Why" column |

### Gotchas

- **Screenshot script is NOT a test:** Use `playwright` library API (`import { chromium } from 'playwright'`), NOT `@playwright/test`. The workspace has `@playwright/test` as a devDependency — running `npx playwright install chromium` ensures browser binaries are available. The script runs standalone via tsx, not the Playwright test runner. If `playwright` (the library package) isn't installed separately, `import { chromium } from 'playwright-core'` also works — it's bundled inside `@playwright/test`.
- **Wait for content:** The dashboard renders seed data via SWR and shows a pre-generated AI summary from cache. Wait for: (1) Recharts charts to render (look for SVG elements), (2) AI summary card text content to be non-empty, (3) a settle delay after animations (500ms Recharts + buffer).
- **Dark mode screenshot:** `page.emulateMedia({ colorScheme: 'dark' })` is NOT enough. This project uses `next-themes` with `attribute="class"`, which applies the `dark` class to `<html>` based on localStorage — NOT the CSS media query. Use `page.addInitScript(() => localStorage.setItem('theme', 'dark'))` before navigating, then navigate. The `ThemeProvider` in `layout.tsx` reads this value on hydration and applies the class.
- **Mermaid on GitHub:** GitHub renders ```mermaid code blocks natively. No build step, no image generation. Keep the diagram simple — hiring managers skim, they don't study.
- **Image paths in README:** Use relative paths: `![Dashboard](docs/screenshots/hero-light.png)`. GitHub renders these correctly.
- **Don't over-write the README:** This is a portfolio piece, not documentation. Case-study format means: what problem, what solution, what's interesting architecturally, how to run it. 200-300 words of prose total, not a technical manual.
- **`.env.example` accuracy:** Verify all required vars are listed. `CLAUDE_API_KEY` should be marked optional — seed data mode works without it.
- **No deployment section:** The PRD mentions a Deploy Gate (live deployment), but that's outside this story's scope. The Demo section should mention seed data mode, not a live URL.

### References

- [Source: README.md] — existing scaffold from Story 1.6
- [Source: playwright.config.ts] — Playwright configuration
- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.3] — acceptance criteria
- [Source: _bmad-output/planning-artifacts/architecture.md#gap-8] — screenshot generation specification
- [Source: _bmad-output/planning-artifacts/architecture.md#gap-9] — screenshot file location
- [Source: _bmad-output/planning-artifacts/prd.md#FR38] — README case study requirement
- [Source: _bmad-output/implementation-artifacts/7-2-seed-data-ai-quality-validation.md] — script patterns
- [Source: _bmad-output/implementation-artifacts/7-5-dark-mode-appearance.md] — dark mode implementation
- [Source: _bmad-output/implementation-artifacts/epic-6-retro-2026-04-01.md] — Story 7.3 sequencing rationale

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Pre-existing lint error in `ThemeToggle.tsx` (Story 7.5) — `react-hooks/set-state-in-effect` for `useEffect(() => setMounted(true), [])`. Not introduced by this story. Needs `useSyncExternalStore` pattern fix in future.

### Completion Notes List

- Created `scripts/generate-screenshots.ts` — Playwright screenshot generator with light/dark mode capture, 1280x800 viewport, Recharts animation settle wait, AI summary card wait
- Dark mode screenshots use `page.addInitScript(() => localStorage.setItem('theme', 'dark'))` because `next-themes` reads localStorage, not CSS media query
- Imported `chromium` from `@playwright/test` (direct devDep) instead of nested `playwright` package — pnpm strict hoisting prevents resolving transitive deps
- Added `pnpm screenshots` npm script in root `package.json`
- Wrote full README case-study: Overview, Problem, Solution, Architecture (Mermaid diagram), Tech Stack with "Why" column, Key Features (8 items), Screenshots, Getting Started, Demo, Project Structure
- Mermaid diagram: ~12 nodes, LR flow with curation pipeline subgraph (TB direction)
- All `<!-- TK -->` placeholders removed from README
- Marked `CLAUDE_API_KEY` as optional in `.env.example`
- Verified `entrypoint.sh` runs migrations + seed on `docker compose up`
- Verified dashboard is public (anonymous access to seed data)
- Full test suite: 769 tests pass, 0 regressions

### Change Log

- 2026-04-09: Story 7.3 implementation — README case-study prose, Mermaid architecture diagram, Playwright screenshot generator, Getting Started verification

### File List

- `scripts/generate-screenshots.ts` — NEW: Playwright screenshot generator (light + dark mode)
- `README.md` — MODIFIED: Full case-study content replacing all TK placeholders
- `package.json` — MODIFIED: Added `screenshots` npm script
- `.env.example` — MODIFIED: Marked `CLAUDE_API_KEY` as optional
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — MODIFIED: Story 7.3 status updates
- `scripts/generate-screenshots.ts_explained.md` — NEW: Interview companion doc for screenshot script
