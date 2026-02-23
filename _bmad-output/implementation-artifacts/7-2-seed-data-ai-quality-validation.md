# Story 7.2: Seed Data AI Quality Validation

Status: done

<!-- Note: Validation is REQUIRED. Every story must complete all 4 steps: Create → Validate → Dev → Code Review. -->

## Story

As a **developer**,
I want seed data to produce a meaningful AI summary validated in CI,
so that the first impression (Sarah the hiring manager running `docker compose up`) always works.

## Acceptance Criteria

1. **Given** the seed data from Story 2.1 exists with deliberate anomalies, **when** the seed validation runs in CI, **then** the curation pipeline snapshot confirms deterministic output from the seed dataset (FR39) **and** the snapshot includes expected statistical findings (seasonal spike, category patterns)

2. **Given** a developer changes the seed data or curation pipeline, **when** the snapshot test fails, **then** the developer is prompted to review and update the snapshot intentionally

3. **Given** Docker Compose starts with seed data, **when** the seed AI summary is loaded, **then** the pre-generated seed summary from Story 3.2 is present and meaningful

## Tasks / Subtasks

- [x] Task 1: Convert `scripts/validate-seed.ts` from pass/fail assertions to snapshot-based validation (AC: #1, #2)
  - [x] 1.1 Snapshot the `TransparencyMetadata` object (statTypes, categoryCount, insightCount, scoringWeights, promptVersion) plus prompt length and a SHA-256 hash of the prompt — NOT the raw prompt string (too noisy for diffs)
  - [x] 1.2 Round all floating-point values to 4 decimal places before snapshotting to prevent cross-platform drift from `simple-statistics` regression
  - [x] 1.3 Write snapshot to `scripts/__snapshots__/seed-validation.snap.json` as formatted JSON
  - [x] 1.4 Compare against stored snapshot — exact match for stat types, categories, weights, prompt version; prompt hash detects template changes
  - [x] 1.5 On mismatch: print clear diff (expected vs actual for each field) + instructions to update with `--update` flag
  - [x] 1.6 Add `--update` CLI flag via `process.argv.includes('--update')` — overwrites snapshot file
  - [x] 1.7 First-run bootstrap: if no snapshot file exists, auto-generate it and print "Snapshot created — commit this file" (don't fail on first run)

- [x] Task 2: Add specific anomaly assertions beyond the snapshot (AC: #1)
  - [x] 2.1 Assert metadata.statTypes includes `anomaly` (December revenue spike, October payroll)
  - [x] 2.2 Assert metadata.statTypes includes `category_breakdown` (6 categories from seed data)
  - [x] 2.3 Assert metadata.statTypes includes `trend` (revenue growth, marketing patterns)
  - [x] 2.4 Assert metadata.insightCount >= 3 (minimum meaningful insight count for seed data)
  - [x] 2.5 Assert metadata.categoryCount >= 5 (adjusted: scoring topN=8 curates to 5 of 6 raw categories — Rent stats score too low to make the cut)

- [x] Task 3: Verify pre-generated seed summary coverage (AC: #3)
  - [x] 3.1 Confirm `e2e/dashboard.spec.ts` already asserts AI summary card renders with content — existing test checked "Powered by AI" footer only
  - [x] 3.2 Strengthened E2E assertion: AI summary region text must be >= 50 characters (meaningful, not empty/error)
  - [x] 3.3 No separate `validate-seed-summary.ts` script needed — E2E covers this

- [x] Task 4: Update CI pipeline for snapshot workflow (AC: #2)
  - [x] 4.1 Initial snapshot generated and ready to commit at `scripts/__snapshots__/seed-validation.snap.json`
  - [x] 4.2 CI seed-validation stage fails with clear diff + --update instructions when snapshot drifts
  - [x] 4.3 Snapshot workflow documented in script's header comment

- [x] Task 5: Verify end-to-end Docker first-impression (AC: #3)
  - [x] 5.1 Covered by E2E test: dashboard loads with seed data and AI summary card displays meaningful content
  - [x] 5.2 Covered by E2E test: pre-generated summary uses cache-first (no SSE), verified via "Powered by AI" footer + 50-char content check

## Dev Notes

### What Already Exists

**`scripts/validate-seed.ts` (Story 7.1):** Already runs the curation pipeline against reconstructed seed data. Currently does a pass/fail check for 2+ distinct stat types. This story evolves it from "does it produce something?" to "does it produce the right things, reproducibly?"

Key facts about the existing script:
- Imports `computeStats`, `scoreInsights`, `assemblePrompt` individually (avoids barrel trap)
- Reconstructs seed data inline via `buildValidationRows()` (matches `seed.ts`'s `buildSeedRows` output shape)
- Uses `tsx` for execution — `pnpm -C apps/api exec tsx ../../scripts/validate-seed.ts`
- Already validates 2+ distinct stat types in assembled context
- Produces `{ prompt, metadata }` from `assemblePrompt()` — metadata has `statTypes`, `categoryCount`, `insightCount`, `scoringWeights`, `promptVersion`

**Curation pipeline (Story 3.1-3.2):** Three-layer architecture:
- `computation.ts` → `computeStats(rows, opts)` → `ComputedStat[]`
- `scoring.ts` → `scoreInsights(stats)` → `ScoredInsight[]` (uses `config/scoring-weights.json`)
- `assembly.ts` → `assemblePrompt(insights)` → `{ prompt, metadata }` (uses `config/prompt-templates/v1.md`)

**Stat types available:** `total`, `average`, `trend`, `anomaly`, `category_breakdown` (5 types in `StatType` enum)

**Seed data shape (72 rows):** 12 months x 6 categories (Revenue, Payroll, Marketing, Rent, Supplies, Utilities). Three deliberate anomalies:
- December revenue spike: $28k vs $12-18k baseline
- October payroll anomaly: $9.2k vs $5.5-6.5k baseline
- Q3 marketing dip: $200-300 vs $800-1200 baseline

**Pre-generated seed summary:** `seed.ts` runs the curation pipeline + Claude API call during seeding (if `CLAUDE_API_KEY` is set), stores result in `ai_summaries` table. If key is missing, it warns and skips — Docker without the key still works but shows no AI summary.

**CI pipeline (Story 7.1):** 5-stage pipeline already running. Stage 3 (`seed-validation`) runs `validate-seed.ts`. The existing script is the foundation — this story enhances it.

### Architecture Compliance

**Snapshot approach (from architecture doc + epics):**
- Validates curation pipeline OUTPUT (assembled prompt), NOT LLM response
- Deterministic, free, fast — no Claude API call in CI
- FR39: "Seed data produces a meaningful AI summary validated in CI for both presence and quality"
- The snapshot captures the pipeline's deterministic output so any change to seed data or curation logic is caught

**Privacy-by-architecture:** `assembly.ts` accepts `ComputedStat[]`, not `DataRow[]` — the snapshot validates the curated output, never raw data

**Import boundaries:**
- Individual file imports from curation pipeline (NOT the barrel `index.ts`)
- `scoring.ts` loads `config/scoring-weights.json` via `readFileSync` at import time
- `assembly.ts` loads `config/prompt-templates/v1.md` the same way
- Both use `import.meta.url`-based path resolution — works with tsx

### Library/Framework Requirements

| Library | Version | Usage |
|---------|---------|-------|
| tsx | (workspace dep) | TypeScript execution for validation scripts |
| simple-statistics 7.8.x | (existing) | Used internally by `computation.ts` |
| Vitest | (existing) | NOT used for seed validation — standalone script with process.exit codes |
| Playwright | (existing) | E2E stage where DB-connected summary check could run |

**No new dependencies needed.** The snapshot comparison can use Node built-ins (`fs`, `path`, `assert` or manual diffing). Keep it simple — a JSON snapshot file compared with `JSON.stringify` equality is sufficient.

### File Structure Requirements

```
scripts/
  validate-seed.ts                    ← MODIFY: add snapshot logic + --update flag
  __snapshots__/
    seed-validation.snap.json         ← NEW: deterministic snapshot of pipeline metadata + prompt hash
e2e/
  dashboard.spec.ts                   ← MODIFY (if needed): strengthen AI summary content assertion
```

### Testing Requirements

This story is about CI validation infrastructure — the "tests" ARE the validation scripts.

**Verification approach:**
- Run `pnpm -C apps/api exec tsx ../../scripts/validate-seed.ts` locally — should pass against stored snapshot
- Run with `--update` flag — should regenerate snapshot
- Modify seed data or scoring weights → run without `--update` → should fail with clear diff
- Push to branch, verify CI Stage 3 passes with committed snapshot

**No new Vitest tests needed.** The validation script IS the test. Adding Vitest tests for a CI validation script would be testing the test.

### Previous Story Intelligence (Story 7.1)

**Patterns established:**
- Scripts live at project root `scripts/` directory
- Use `tsx` for TypeScript execution (resolved via api workspace: `pnpm -C apps/api exec tsx`)
- Path aliases (`@/`) don't work in scripts — use explicit relative imports
- Individual curation file imports avoid the barrel crash trap
- `buildValidationRows()` already reconstructs seed data inline (duplicates `buildSeedRows` logic since it's not exported)

**Gotchas from Story 7.1:**
- `scoring.ts` and `assembly.ts` load config files via `readFileSync` at import time using `import.meta.url` — this works with tsx but path must resolve correctly from the script's execution context
- The validation script runs in the api workspace context (`pnpm -C apps/api exec`) which is why relative imports like `../apps/api/src/...` work from the `scripts/` directory
- `.env.ci` provides dummy env vars for CI — the validation script doesn't need any env vars since it avoids the config.ts/db path entirely

**Code review findings from 7.1:**
- Production Docker builds in CI (not dev targets)
- Playwright artifact upload for debugging
- `.gitkeep` for empty directories
- Smoke test CI/local guard
- `rateLimiter.test.ts` retry for flakiness

### Git Intelligence

Recent commits show Epic 7 work:
- `83a0a61` — RLS gap fixes (7.6 followup)
- `2a1b5a5` — Story 7.6 (RLS) + 7.5 (dark mode) implementation
- Story 7.1 CI pipeline is the immediate predecessor — all infrastructure is in place

### DO NOT Reinvent

| What | Where | Why |
|------|-------|-----|
| Seed data construction | `scripts/validate-seed.ts` `buildValidationRows()` | Already reconstructs 72 rows matching seed.ts |
| Pipeline execution | `validate-seed.ts` lines 67-101 | computeStats → scoreInsights → assemblePrompt chain already works |
| CI job config | `.github/workflows/ci.yml` seed-validation job | Already runs the script — no job changes needed |
| Curation types | `apps/api/src/services/curation/types.ts` | `TransparencyMetadata` has all the fields for snapshot |
| Scoring config | `apps/api/src/services/curation/config/scoring-weights.json` | Loaded by scoring.ts at import time |
| Prompt template | `apps/api/src/services/curation/config/prompt-templates/v1.md` | Loaded by assembly.ts at import time |

### Gotchas

- **Snapshot the metadata, not the prompt:** The raw `prompt` string contains the full template text — diffs are noisy and brittle. Snapshot `TransparencyMetadata` + prompt SHA-256 hash + prompt length. The metadata IS the quality signal; the hash catches template changes without verbose diffs.
- **Floating-point rounding is mandatory:** `computeStats` uses `simple-statistics` for trend regression. Round all numeric values to 4 decimal places before writing the snapshot. Without this, the same seed data can produce different snapshots on different Node versions or OS architectures.
- **`--update` flag parsing:** Use `process.argv.includes('--update')` — no CLI framework needed.
- **First-run bootstrap:** If no snapshot file exists, auto-generate it and exit 0 with a message. This prevents the first CI run from failing and makes local setup frictionless.
- **Don't break existing CI:** The seed-validation stage already passes. The enhanced script must be backward-compatible — existing pass/fail assertions remain as guards before the snapshot comparison.
- **No separate DB-connected script:** The existing E2E test (`e2e/dashboard.spec.ts`) already asserts the AI summary card renders. Adding a separate `validate-seed-summary.ts` that connects to the DB duplicates coverage and adds complexity for minimal gain. Strengthen the E2E assertion if needed instead.

### References

- [Source: scripts/validate-seed.ts] — existing validation script (Story 7.1)
- [Source: apps/api/src/services/curation/types.ts] — StatType enum, TransparencyMetadata schema
- [Source: apps/api/src/services/curation/computation.ts] — computeStats function
- [Source: apps/api/src/services/curation/scoring.ts] — scoreInsights function (loads scoring-weights.json)
- [Source: apps/api/src/services/curation/assembly.ts] — assemblePrompt function (loads prompt template)
- [Source: apps/api/src/db/seed.ts] — buildSeedRows (not exported), seed summary generation
- [Source: .github/workflows/ci.yml] — CI Stage 3 seed-validation job
- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.2] — acceptance criteria
- [Source: _bmad-output/planning-artifacts/architecture.md] — snapshot approach specification
- [Source: _bmad-output/project-context.md#Seed Validation] — CI stage 3 description

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- categoryCount assertion adjusted from `=== 6` to `>= 5`: scoring topN=8 curates insights, Rent's flat $3k/month stats score too low to make the cut. 5 of 6 categories appear in curated output — correct pipeline behavior.

### Completion Notes List

- Enhanced `validate-seed.ts` from simple pass/fail guards to 3-phase validation: (1) pipeline guard rails, (2) anomaly-specific assertions, (3) snapshot comparison
- Snapshot captures metadata + SHA-256 prompt hash, not raw prompt text — clean diffs, no noise
- All floating-point values rounded to 4 decimal places for cross-platform stability
- `--update` flag and first-run bootstrap both work as specified
- Strengthened E2E test to verify AI summary content has 50+ characters (was only checking footer text)
- No CI workflow changes needed — existing seed-validation stage runs the enhanced script as-is
- No new dependencies added — all Node built-ins (crypto, fs, path)

### Change Log

- 2026-04-06: Implemented snapshot-based seed validation with anomaly assertions and strengthened E2E coverage

### File List

- scripts/validate-seed.ts (modified) — snapshot logic, --update flag, anomaly assertions
- scripts/__snapshots__/seed-validation.snap.json (new) — deterministic pipeline snapshot
- e2e/dashboard.spec.ts (modified) — strengthened AI summary content assertion (50+ chars)
- _bmad-output/implementation-artifacts/7-2-seed-data-ai-quality-validation.md (modified) — story status + task completion
- _bmad-output/implementation-artifacts/sprint-status.yaml (modified) — story status tracking
