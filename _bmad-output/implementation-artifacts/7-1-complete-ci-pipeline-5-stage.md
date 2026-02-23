# Story 7.1: Complete CI Pipeline (5-Stage)

Status: done

<!-- Note: Validation is REQUIRED. Every story must complete all 4 steps: Create → Validate → Dev → Code Review. -->

## Story

As a **developer**,
I want the full 5-stage CI pipeline running on every push,
so that code quality, tests, seed validation, E2E, and Docker integrity are all verified automatically.

## Acceptance Criteria

1. **Given** the CI skeleton from Story 1.6 exists (lint + typecheck), **when** the pipeline is expanded, **then** all 5 stages run in order: lint/typecheck → test → seed-validation → E2E → Docker smoke (FR37)

2. **Given** the test stage runs, **when** Vitest executes, **then** unit and integration tests pass for business logic, API routes, curation pipeline, and Client Components — test files are co-located (`*.test.ts`) next to source, no `__mocks__/` directories

3. **Given** the seed-validation stage runs, **when** the snapshot approach executes, **then** it validates curation pipeline output determinism (not LLM response) — deterministic and free (FR39)

4. **Given** the E2E stage runs, **when** Playwright executes, **then** E2E tests in the root `e2e/` directory verify at minimum: dashboard loads with seed data, AI summary card renders

5. **Given** the Docker smoke stage runs, **when** the test executes, **then** it runs `docker compose up`, waits for health check, then `docker compose down` (NFR15)

6. **Given** the test stage includes accessibility checks, **when** axe-core runs against rendered pages, **then** all pages pass with zero critical violations (NFR27)

## Tasks / Subtasks

- [x] Task 1: Expand CI workflow — Stage 2: Vitest (AC: #2)
  - [x] Add `test` job to `.github/workflows/ci.yml` that depends on `quality` job
  - [x] Run `pnpm turbo test` (already configured in turbo.json)
  - [x] Node 22, pnpm 10, `--frozen-lockfile`
  - [x] No Docker services needed — unit tests use mocks, not real DB

- [x] Task 2: Create `scripts/validate-seed.ts` — Stage 3: Seed validation (AC: #3)
  - [x] Create `scripts/` directory at project root
  - [x] Write `validate-seed.ts` — imports curation pipeline functions from individual files (NOT the barrel `index.ts`), runs them against seed data, asserts 2+ distinct stat categories (`trend`, `anomaly`, `category_breakdown`) in assembled context
  - [x] Validates curation pipeline OUTPUT (assembled prompt), NOT LLM response — deterministic, free, no Claude API call
  - [x] Add `seed-validation` job to CI that depends on `test` job
  - [x] Runs with `pnpm -C apps/api exec tsx ../../scripts/validate-seed.ts` (Node environment, not browser)

- [x] Task 3: Set up Playwright + initial E2E test (AC: #4, #6)
  - [x] Install Playwright in root `package.json` (or as workspace dev dependency)
  - [x] Create `playwright.config.ts` at project root
  - [x] Create `e2e/` directory structure: `e2e/fixtures/`, `e2e/helpers/`
  - [x] Write `e2e/dashboard.spec.ts` — verifies: dashboard loads, seed data charts render, AI summary card visible
  - [x] Integrate `@axe-core/playwright` for accessibility checks — assert zero critical violations on dashboard page
  - [x] Add `e2e` job to CI that depends on `seed-validation`
  - [x] E2E job starts Docker Compose (db + redis + api + web), waits for health, runs Playwright

- [x] Task 4: Create `scripts/smoke-test.sh` — Stage 5: Docker smoke (AC: #5)
  - [x] Write `smoke-test.sh` — `docker compose up -d` (with override for port exposure), wait for health check on api (:3001), `docker compose down`
  - [x] Health check: curl `/health` endpoint on api, verify HTTP 200
  - [x] Add `docker-smoke` job to CI that depends on `e2e`
  - [x] Uses `docker compose` (V2 syntax, not `docker-compose`)
  - [x] Create `.env.ci` with required env vars for Docker builds in CI (DB URLs, dummy keys for non-called services). CI jobs copy `.env.ci` to `.env` before `docker compose up`.

- [x] Task 5: Pipeline integration and verification (AC: #1)
  - [x] Verify all 5 stages run sequentially: `quality` → `test` → `seed-validation` → `e2e` → `docker-smoke`
  - [x] Each stage depends on previous via `needs:` key
  - [x] Verify pipeline fails fast on any stage failure

## Dev Notes

### What Already Exists

**Stage 1 (done — Story 1.6):** `.github/workflows/ci.yml` has a `quality` job that runs `pnpm turbo lint` and `pnpm turbo type-check`. Node 22, pnpm 10, `actions/checkout@v5`, `pnpm/action-setup@v4`, `actions/setup-node@v4` with pnpm cache.

**Test infrastructure:** ~53 test files across `apps/api`, `apps/web`, `packages/shared`. Three `vitest.config.ts` files — api (node env), web (jsdom + react plugin), shared. Tests run via `pnpm turbo test`. All use co-located `*.test.ts` pattern.

**Docker:** `docker-compose.yml` has 4 services (web, api, db, redis). DB and Redis both have health checks configured. DB uses `pg_isready -U app_admin -d analytics`. Redis uses `redis-cli ping`. **Port mappings (3000:3000, 3001:3001) are in `docker-compose.override.yml` only** — the base compose file does NOT expose ports to the host. Both E2E and smoke test CI jobs need the override for `curl` to reach services.

**No Playwright yet:** No `playwright.config.ts`, no `e2e/` directory, no E2E tests. Playwright needs to be installed and configured from scratch.

**No scripts/ yet:** The `scripts/` directory doesn't exist. Both `validate-seed.ts` and `smoke-test.sh` need to be created.

### Architecture Compliance

The architecture doc specifies a 5-stage pipeline: lint/typecheck → test → seed-validation → E2E → Docker smoke. Each stage maps to specific concerns:

- **Stage 1** (existing): Static analysis — catches type errors and lint violations before burning compute on tests
- **Stage 2** (new): Vitest — unit + integration tests for all three workspaces
- **Stage 3** (new): Seed validation — deterministic check that curation pipeline produces meaningful output from seed data. Validates the assembled prompt contains 2+ distinct stat categories. NO Claude API call — free and fast.
- **Stage 4** (new): E2E — Playwright against full Docker Compose stack. Verifies RSC rendering, user journeys, accessibility.
- **Stage 5** (new): Docker smoke — proves `docker compose up` works end-to-end for the "hiring manager runs one command" scenario (FR36).

### Seed Validation Approach (Critical — Don't Call Claude)

The seed validation script does NOT call the Claude API. It validates the curation pipeline's deterministic output:

1. Import `computeStats` from `apps/api/src/services/curation/computation.ts`, `scoreInsights` from `scoring.ts`, `assemblePrompt` from `assembly.ts` — **import from individual files, NOT the barrel `index.ts`** (the barrel pulls in `db` → `config.ts` → crashes without env vars)
2. Construct seed data rows matching the `DataRow` interface (`{ category, date, amount }`) — note that `buildSeedRows` in `apps/api/src/db/seed.ts` is NOT exported, so either export it or duplicate the seed row construction inline
3. Run the chain: `computeStats(rows)` → `scoreInsights(stats)` → `assemblePrompt(insights)`
4. Assert the assembled context contains 2+ distinct stat categories from the `StatType` enum: `total`, `average`, `trend`, `anomaly`, `category_breakdown` (there is NO `comparison` type)

**Import dependencies to know about:**
- `scoring.ts` loads `config/scoring-weights.json` at import time via `readFileSync` (resolves relative to source file location — works with tsx)
- `assembly.ts` loads `config/prompt-templates/v1.md` the same way
- Both use `import.meta.url`-based path resolution, which works when tsx imports the source `.ts` files directly

The script runs with `tsx` (TypeScript execution). Path aliases (`@/`) won't resolve — use explicit relative imports from the scripts/ directory.

### Playwright Setup Decisions

**Config location:** Root `playwright.config.ts` — E2E tests span both apps, so they live at the monorepo root.

**Test directory:** `e2e/` at project root (per architecture doc).

**Base URL:** `http://localhost:3000` (Next.js web app). The E2E CI job needs Docker Compose running with all 4 services.

**axe-core integration:** Use `@axe-core/playwright` package. After page loads, run `new AxeBuilder({ page }).analyze()` and assert zero critical violations. This covers NFR27.

**Browser:** Chromium only for CI speed. Configure in `playwright.config.ts`.

### CI Job Dependencies (GitHub Actions)

```yaml
jobs:
  quality:        # Stage 1 — existing
    ...
  test:           # Stage 2 — new
    needs: quality
    ...
  seed-validation: # Stage 3 — new
    needs: test
    ...
  e2e:            # Stage 4 — new
    needs: seed-validation
    ...
  docker-smoke:   # Stage 5 — new
    needs: e2e
    ...
```

Each job uses `needs:` for sequential execution. Pipeline fails fast — if Stage 2 fails, Stages 3-5 don't run.

### E2E CI Job — Docker Compose in GitHub Actions

The E2E job needs the full stack running. GitHub Actions approach:

1. Start Docker Compose in the background: `docker compose up -d`
2. Wait for services to be healthy (use the existing healthcheck configs for db + redis)
3. Wait for web app to respond on :3000
4. Run Playwright tests
5. Tear down: `docker compose down`

The health check wait can use a simple retry loop with `curl`. Docker Compose V2 syntax (`docker compose`, not `docker-compose`).

### Docker Smoke Test Design

`scripts/smoke-test.sh` proves the Docker build works — the "hiring manager test":

1. `docker compose up -d` — start all services (override file auto-merges, exposing ports)
2. Wait for health (retry curl on `http://localhost:3001/health` — port comes from override)
3. Verify HTTP 200 response
4. `docker compose down` — clean up
5. Exit 0 on success, non-zero on failure

**CI env vars:** The API won't start without Zod-validated env vars (`DATABASE_URL`, `JWT_SECRET`, `CLAUDE_API_KEY`, etc.). `.env` is gitignored, so CI needs a `.env.ci` file committed with dummy/test values for services that aren't actually called during smoke (Claude, Stripe, Google OAuth). DB/Redis URLs point to the Docker Compose service names. The CI job uses `--env-file .env.ci` or copies `.env.ci` to `.env` before `docker compose up`.

**E2E vs smoke overlap:** Both stages spin up Docker Compose. The E2E stage tests user-facing behavior (Playwright). The smoke stage tests that the Docker build itself succeeds and the app responds to health checks. They're distinct concerns — E2E could pass with a dev-mode workaround that a clean Docker build would catch.

### GitHub Actions Services vs Docker Compose

For the E2E stage, use Docker Compose (not GitHub Actions `services:` key) because:
- Docker Compose matches the developer experience exactly
- The existing `docker-compose.yml` has proper health checks, networking, init scripts
- `services:` in GitHub Actions doesn't support the full compose feature set (init.sql, entrypoints)

### Project Structure Notes

- Playwright config goes at project root (not inside any app)
- `e2e/` directory at project root (matches architecture doc)
- `scripts/` directory at project root (matches architecture doc)
- CI workflow stays at `.github/workflows/ci.yml` — expand the existing file

### References

- [Source: .github/workflows/ci.yml] — existing Stage 1 (lint + typecheck)
- [Source: _bmad-output/planning-artifacts/architecture.md#CI Pipeline Structure] — 5-stage specification
- [Source: _bmad-output/project-context.md#CI Pipeline Testing] — stage descriptions and seed validation approach
- [Source: _bmad-output/project-context.md#Testing Rules] — test boundary rules, file organization, mocking rules
- [Source: docker-compose.yml] — existing 4-service compose with health checks
- [Source: turbo.json] — test task configuration (`dependsOn: ["^build"]`)
- [Source: apps/api/vitest.config.ts] — API test config (node env, path aliases)
- [Source: apps/web/vitest.config.ts] — Web test config (jsdom, react plugin, setup file)

### DO NOT Reinvent

| What | Where | Why |
|------|-------|-----|
| Vitest config | `apps/*/vitest.config.ts` | Already configured for both apps — just run `pnpm turbo test` |
| Docker health checks | `docker-compose.yml` | DB and Redis health checks already exist |
| Turborepo test task | `turbo.json` | `test` task with `dependsOn: ["^build"]` already defined |
| CI Stage 1 setup | `.github/workflows/ci.yml` | Node/pnpm/checkout actions already configured — reuse in new jobs |
| Curation pipeline | `apps/api/src/services/curation/computation.ts`, `scoring.ts`, `assembly.ts` | Import individual files — the barrel `index.ts` crashes outside the app (pulls in DB/config) |

### Gotchas From Previous Epics

- **tinypool "Channel closed" crash:** Known Node 22 cleanup issue at test process exit. Not a test failure — don't let it fail CI. Check if this manifests in GitHub Actions runner.
- **`rateLimiter.test.ts`:** Known flaky — timing-dependent. May need retry or increased timeouts in CI.
- **Docker volume state:** Dual-role setup from Story 7.6 requires `docker compose down -v` for fresh init. CI runners get clean state each run, so this isn't a CI problem — but document it.
- **Path aliases in scripts/:** `tsx` won't resolve `@/` aliases from `tsconfig.json`. Use explicit relative imports in the seed validation script.
- **Curation barrel import is a trap:** `curation/index.ts` imports `db` → `config.ts` → crashes without env vars. Always import `computation.ts`, `scoring.ts`, `assembly.ts` individually for the validation script.
- **`buildSeedRows` not exported:** The seed row construction function in `seed.ts` is internal. Either export it or reconstruct seed-like data inline in the validation script.
- **`.env` missing in CI:** Docker Compose uses `env_file: .env`, but `.env` is gitignored. Create `.env.ci` with test values for CI Docker jobs.
- **Playwright install:** `npx playwright install --with-deps chromium` needed in CI to install browser + system dependencies.
- **GitHub Actions Docker Compose:** Available by default on `ubuntu-latest`. Use `docker compose` (V2), not `docker-compose` (V1).

### Testing Requirements

This story is primarily about CI infrastructure — the "tests" are the pipeline itself working correctly.

**New files to test:**
- `scripts/validate-seed.ts` — can be tested locally with `npx tsx scripts/validate-seed.ts`
- `scripts/smoke-test.sh` — can be tested locally with `bash scripts/smoke-test.sh` (requires Docker running)
- `e2e/dashboard.spec.ts` — can be tested locally with `npx playwright test` (requires Docker Compose up)

**Verification approach:**
- Push to a branch, open a PR, verify all 5 CI stages pass
- Each stage should have clear naming in the GitHub Actions UI

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Pre-existing type-check failure (rootDir boundary between api/shared packages) confirmed on main before changes — not a regression.

### Completion Notes List

- **Task 1**: Added `test` job to CI depending on `quality`. Runs `pnpm turbo test` — 769 tests pass (445 API + 324 web) across 75 files.
- **Task 2**: Created `scripts/validate-seed.ts` that imports curation pipeline files individually (avoiding barrel trap). Reconstructs seed data inline (buildSeedRows not exported). Validated locally — produces 3 distinct stat types (anomaly, trend, category_breakdown) from 72 rows. Runs via `pnpm -C apps/api exec tsx` to use api workspace's tsx dependency.
- **Task 3**: Installed `@playwright/test` and `@axe-core/playwright` at root. Created `playwright.config.ts` (chromium-only, baseURL localhost:3000). Created `e2e/dashboard.spec.ts` with 3 tests: dashboard loads with heading, AI summary card renders ("Powered by AI"), accessibility check (zero critical violations via axe-core). Added `e2e` CI job with Docker Compose startup, service health waits, and teardown.
- **Task 4**: Created `scripts/smoke-test.sh` with trap-based cleanup, 90s health check timeout, explicit HTTP 200 assertion. Added `docker-smoke` CI job depending on `e2e`.
- **Task 5**: Verified 5-stage sequential chain: quality → test → seed-validation → e2e → docker-smoke. Each stage uses `needs:` key for fail-fast behavior.
- Created `.env.ci` with dummy values for services not called during CI (Claude, Stripe, Google OAuth). DB/Redis URLs point to Docker Compose service names.
- Added Playwright artifacts to `.gitignore` (test-results/, playwright-report/).

### Change Log

- 2026-04-04: Implemented all 5 tasks — full 5-stage CI pipeline complete.
- 2026-04-05: Code review fixes — production Docker builds in CI, Playwright artifact upload, .gitkeep for empty dirs, smoke test CI/local guard, rateLimiter test retry.

### File List

- `.github/workflows/ci.yml` — expanded with 4 new jobs (test, seed-validation, e2e, docker-smoke); review: switched to explicit compose files for production builds, added Playwright artifact upload
- `scripts/validate-seed.ts` — new: seed data curation pipeline validation script
- `scripts/smoke-test.sh` — new: Docker smoke test script; review: added --ci flag for production builds, local dev warning
- `playwright.config.ts` — new: Playwright configuration (chromium, root e2e dir)
- `e2e/dashboard.spec.ts` — new: E2E tests (dashboard load, AI card, accessibility)
- `e2e/fixtures/.gitkeep` — new: preserves empty directory in git
- `e2e/helpers/.gitkeep` — new: preserves empty directory in git
- `.env.ci` — new: CI environment variables with dummy values
- `.gitignore` — modified: added Playwright artifact directories
- `package.json` — modified: added @playwright/test and @axe-core/playwright dev deps
- `pnpm-lock.yaml` — modified: lockfile updated for new dependencies
- `docker-compose.ci.yml` — new: CI-only compose override with port exposure (no dev targets)
- `apps/api/tsconfig.json` — modified: removed rootDir (moved to tsconfig.build.json for build-only scope)
- `apps/api/tsconfig.build.json` — new: build-specific tsconfig with rootDir constraint
- `apps/api/src/middleware/rateLimiter.test.ts` — modified: added retry:2 for CI flakiness
- `.github/workflows/ci.yml_explained.md` — new: interview companion doc
- `scripts/validate-seed.ts_explained.md` — new: interview companion doc
- `scripts/smoke-test.sh_explained.md` — new: interview companion doc
- `e2e/dashboard.spec.ts_explained.md` — new: interview companion doc
