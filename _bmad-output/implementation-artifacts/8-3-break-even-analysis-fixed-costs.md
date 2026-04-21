# Story 8.3: Break-Even Analysis — Fixed Costs Input + Break-Even Stat Type

Status: done

<!-- Note: Validation is REQUIRED. Every story must complete all 4 steps: Create → Validate → Dev → Code Review. -->
<!-- Post-MVP story. Epic 8 cash-flow arc. 8.1 (Cash Flow) shipped 2026-04-18, 8.2 (Runway) shipped 2026-04-20, 8.5 (Chart Mapping) shipped 2026-04-21. 8.3 reuses the Locked Insight scaffold, the `org_financials` JSONB merge path, and the prompt versioning pattern from 8.2. -->

## Story

As a **small business owner**,
I want the AI to tell me the monthly revenue I need to cover my fixed costs,
so that I know how much I have to earn before I stop burning cash.

## Business Context

Runway answered "how long do I have?" — break-even answers the sibling: "how much do I need to earn to stop burning?" Together they turn a burn signal into a plan.

Break-even lives in Epic 8 rather than as a settings-only feature because the number is only meaningful next to current revenue. A static "your break-even is $42k/mo" in a settings page is a number; a dashboard insight that says "you're earning $31k/mo against a break-even of $42k — that gap is your burn" is a diagnosis.

Dependencies unblocked: Story 8.4 (Forward Cash Flow Forecast cites break-even in its narrative), GTM Week 3 email digest (break-even is the third bullet after cash flow direction and runway).

## Acceptance Criteria

1. **`StatType.BreakEven` is added to the curation pipeline discriminated union** — Given the `ComputedStat` union in `apps/api/src/services/curation/types.ts`, when this story ships, then a new `StatType.BreakEven = 'break_even'` is added to the enum with a typed `BreakEvenDetails` interface: `{ monthlyFixedCosts: number, marginPercent: number, breakEvenRevenue: number, currentMonthlyRevenue: number, gap: number, confidence: 'high' | 'moderate' | 'low' }`, and a `BreakEvenStat extends BaseComputedStat` interface added to the `ComputedStat` union. (FR23)

2. **`computeBreakEven` is a pure function that consumes `MarginTrendStat` + `monthlyFixedCosts` + `currentMonthlyRevenue`** — Given the privacy boundary established by Stories 3.1 and 8.2, when `computeBreakEven(marginStats, monthlyFixedCosts, currentMonthlyRevenue)` runs, then it operates on already-aggregated stats (never raw `DataRow[]`), computes `breakEvenRevenue = monthlyFixedCosts / (marginPercent / 100)`, computes `gap = breakEvenRevenue - currentMonthlyRevenue` (positive gap = still burning; negative = above break-even), and returns `BreakEvenStat[]`. **`currentMonthlyRevenue` is computed inside `computeStats` from the same monthly revenue aggregation already built by the pipeline's other stats** (details in Task 2.7) — NOT pulled from `CashFlowStat`, because CashFlow suppresses for near-break-even businesses and that would silently also suppress break-even for healthy orgs. (NFR12)

3. **Suppression — no margin data** — Given `marginStats.length === 0` (i.e., `MarginTrend` suppressed because fewer than 4 months of data or zero revenue in either half), when `computeBreakEven` runs, then it returns `[]`. Rationale: computing break-even against a guessed margin would fabricate a confident number from nothing. Same editorial posture as Story 8.1's suppression pattern.

4. **Suppression — no fixed costs** — Given `monthlyFixedCosts == null || monthlyFixedCosts === 0`, when `computeBreakEven` runs, then it returns `[]`. Rationale: zero fixed costs implies break-even at $0 revenue, which is not an insight. The Locked Insight card handles the "no fixed costs yet" UX; computation stays pure.

5. **Suppression — non-positive margin** — Given `marginStats[0].details.recentMarginPercent <= 0` (expenses meet or exceed revenue), when `computeBreakEven` runs, then it returns `[]`. Rationale: negative margin produces negative break-even revenue (mathematically nonsensical), and zero margin produces infinite. Owners with non-positive margin have a bigger problem than break-even can express — `CashFlow burning` and `MarginTrend shrinking` already carry that signal.

6. **Suppression — trivially-low margin** — Given `0 < recentMarginPercent < 2` (margin under 2%), when `computeBreakEven` runs, then it returns `[]`. Rationale: a 1% margin produces a break-even revenue of `fixedCosts × 100`, which is an implausibly large target and leads to scary-but-meaningless insights. The 2% threshold is tighter than `computeCashFlow`'s 5% `break_even` band — intentionally so: CashFlow's 5% means "net is close enough to zero to suppress a binary burn signal," while BreakEven's 2% means "margin is too thin to produce a reliable break-even revenue target." Different concerns, different thresholds. The resulting asymmetry — a business with 3% margin and near-zero net will see BreakEven surface while CashFlow stays suppressed — is accepted: the owner still gets actionable framing ("you'd need about $X/mo to comfortably cover fixed costs"), just without a paired burn-rate paragraph.

7. **Confidence tiers are deterministic and documented in code** — Given the computation runs, when assigning `confidence`, the mapping follows this table:

    | `recentMarginPercent` | `direction` | `confidence` |
    |---|---|---|
    | `>= 10` | `!== 'shrinking'` | `'high'` |
    | `>= 10` | `'shrinking'` | `'moderate'` |
    | `>= 5` (and `< 10`) | any | `'moderate'` |
    | `2 <= x < 5` | any | `'low'` |

    Confidence flows into the LLM prompt so framing can soften on low-confidence break-even ("at roughly X percent margin you'd need about $Y/mo — margin is thin, keep an eye on it").

8. **Scoring reflects high actionability when `gap > 0`** — Given scoring runs, when a `BreakEvenStat` with `gap > 0` (business is below break-even) is evaluated, then `actionabilityScore = 0.88`, `noveltyScore = 0.75`, `specificityScore = 0.85`. Under default weights (novelty 0.35, actionability 0.40, specificity 0.25) total = `0.35 × 0.75 + 0.40 × 0.88 + 0.25 × 0.85 = 0.8270`. This ranks below critical Runway (0.9025) but above Cash Flow burning (0.8400), which is the intended order: runway says how long, break-even says how much, and when both exist both are surfaced.

9. **Scoring demotes when `gap <= 0`** — Given the business is at or above break-even (`gap <= 0`), when scoring runs, then `actionabilityScore = 0.55` (nothing urgent), `noveltyScore = 0.60`, `specificityScore = 0.85`. This ensures break-even doesn't dominate a healthy business's insight feed — it becomes a reassuring data point rather than the headline.

10. **Assembly renders break-even into the LLM prompt** — Given a `BreakEvenStat` passes into `assembly.ts`, when `formatStat()` renders it, then output is one line matching existing format conventions: `- [Overall] Break-Even: $42,000/mo at ${marginPercent}% margin — current revenue $31,000/mo, gap $11,000 (confidence: high, relevance: 0.83)`. Uses the existing `usd` formatter. Rounds `breakEvenRevenue` and `gap` to whole dollars; rounds `marginPercent` to 1 decimal.

11. **Prompt template v1.5 adds break-even framing** — Given `DEFAULT_VERSION = 'v1.4'` after Story 8.5, when this story ships, then a new `apps/api/src/services/curation/config/prompt-templates/v1.5.md` extends v1.4 verbatim and appends the block below. `DEFAULT_VERSION` in `assembly.ts` bumps from `'v1.4'` to `'v1.5'`. This cache-invalidates existing `ai_summaries` rows with `promptVersion: 'v1.4'` on their next read, so break-even-aware framing reaches users on the next summary request. (FR26, legal posture from Story 3.2)

    **Append to `v1.5.md` (copy verbatim into the template):**

    ```markdown
    ## Break-Even Framing

    When a `Break-Even` stat appears with a positive gap (`current revenue < break-even revenue`), frame it descriptively: "you'd need about $X/mo in revenue to cover fixed costs at your current margin — about $Y more than you're earning now, worth reviewing with your accountant." Never "you need to raise prices" or any prescriptive imperative.

    When a `Break-Even` stat appears with a non-positive gap (`current revenue >= break-even revenue`), frame it briefly: "you're covering your fixed costs — revenue of $X/mo against break-even of $Y/mo." Reassuring, not boastful. Do not lead with this paragraph.

    ## Runway + Break-Even Dedup

    If both `Runway` and `Break-Even` (with positive gap) appear in the stats, lead with runway (how long), follow with break-even (how much). Do not repeat the monthly-fixed-costs figure across paragraphs; mention it once, in the break-even paragraph.

    ## Low-Confidence Break-Even Hedge

    When `Break-Even.confidence === 'low'`, soften framing with "roughly" or "around" and add "margin is thin, so this figure may shift." Do not state an exact break-even figure with high certainty when margin is under 5%.
    ```

12. **Tier 1 hallucination validator covers fabricated `breakEvenRevenue` and `monthlyFixedCosts` mentions** — Given the validator at `apps/api/src/services/curation/validator.ts:97` scans currency (`$...`) tokens against an allowed-set built by `classifyStatNumbers()`, when a summary referencing break-even is validated, then both `breakEvenRevenue` and `monthlyFixedCosts` are pushed into the currency allowed-set via a new `case StatType.BreakEven` branch in `classifyStatNumbers`. The pairwise-sum allowance at `validator.ts:117-122` covers owner-readable arithmetic like `breakEven - currentRevenue`. Known tolerance: a fabricated `gap` value close to `|breakEvenRevenue - currentRevenue|` may slip through — documented as an acknowledged limitation. The `marginPercent` token is already covered by the existing `StatType.MarginTrend` case (no duplication needed).

13. **Dashboard renders a Locked Insight card when fixed costs are missing** — Given a business where `hasMarginSignal === true` AND `monthlyFixedCosts == null`, when the dashboard loads, then a Locked Insight card renders inline in the insight feed with title "Enable Break-Even Analysis", description "Add your monthly fixed costs to see the revenue you need to cover them at your current margin.", input label "Monthly fixed costs", `inputMask="currency"`, `inputMax={9_999_999}`, and a single save action. Submitting persists via `PUT /api/org/financials` (which already handles `monthlyFixedCosts` through `orgFinancialsSchema`). Reuses `LockedInsightCard.tsx` from Story 8.2 — no new component. `hasMarginSignal` is a new boolean surfaced by `GET /api/dashboard/charts` — deterministic from row count, so it's available on first dashboard load without waiting for an AI summary stream (see Task 7.2).

14. **Card is suppressed when no margin signal exists** — Given `hasMarginSignal === false` (the org has <4 months of data, or zero-revenue halves, or any other condition under which `computeMarginTrend` would suppress), when the dashboard loads with `monthlyFixedCosts == null`, then the "Enable Break-Even" card does NOT render. Rationale: asking for fixed costs before the pipeline can compute margin sets up a broken promise — the owner enters a value and sees nothing. The card only appears when a computation can actually run.

15. **Settings page exposes `monthlyFixedCosts` for editing** — Given the existing `/settings/financials` page from Story 8.2, when this story ships, then `FinancialsForm.tsx` gains a `monthlyFixedCosts` numeric input (USD mask, positive, max `$9,999,999`) that reads from and writes to `orgFinancialsSchema`. The existing `updateOrgFinancials` helper handles the JSONB merge — no new query, no new endpoint. RBAC (owner-only) is already enforced server-side on `PUT /api/org/financials` via `roleGuard('owner')`.

16. **Dashboard surfaces break-even when all inputs exist** — Given a business with `MarginTrend` present AND `monthlyFixedCosts` set, when the curation pipeline runs and `computeBreakEven` returns a stat, then the insight feed shows the AI summary with break-even framing (via prompt v1.5) and the Transparency Panel lists `Break-Even` as a contributing stat type. No separate dashboard widget — break-even lives inside the AI summary narrative, same delivery shape as `CashFlow` and `Runway`.

17. **Privacy boundary holds** — Given the privacy invariant from Story 3.1, when break-even is computed, then `computeBreakEven` receives `MarginTrendStat[]` + a scalar `monthlyFixedCosts` + a scalar `currentMonthlyRevenue` (derived from the existing revenue totals already in scope). No `DataRow[]` access. `BreakEvenStat.details` carries only numbers and a confidence enum — no row IDs, no transaction descriptions. The TypeScript discriminated union enforces this at the type level. (FR23, NFR12)

18. **`Break-Even` label appears in the Transparency Panel** — Given `apps/web/app/dashboard/TransparencyPanel.tsx` has a `STAT_TYPE_LABELS` map, when this story ships, then `break_even: 'Break-Even'` is added to the map. Without this entry, the panel would render `'break_even'` as a raw key — same cosmetic regression pattern that Stories 8.1 and 8.2 caught.

19. **Unit tests cover every computation branch** — Given the computation is a pure function, when `computation.test.ts` runs, then fixtures cover:
    - Healthy business above break-even (`recentMarginPercent = 25`, `monthlyFixedCosts = 10_000`, `currentRevenue = 80_000`) → emitted with `gap = 40_000 - 80_000 = -40_000`, confidence `'high'`, demoted scoring
    - Burning business below break-even (`recentMarginPercent = 20`, `monthlyFixedCosts = 15_000`, `currentRevenue = 50_000`) → emitted with `gap = 75_000 - 50_000 = 25_000`, confidence `'high'`, high actionability
    - Shrinking margin (`direction = 'shrinking'`, `recentMarginPercent = 15`) → emitted but confidence is `'moderate'` (direction override)
    - Low margin (`recentMarginPercent = 7`) → emitted, confidence `'moderate'`
    - Thin margin (`recentMarginPercent = 3`) → emitted, confidence `'low'`
    - Margin trend suppressed (`marginStats.length === 0`) → suppressed
    - `undefined` `monthlyFixedCosts` → suppressed
    - `null` `monthlyFixedCosts` → suppressed
    - Zero `monthlyFixedCosts` → suppressed
    - Zero margin (`recentMarginPercent === 0`) → suppressed
    - Negative margin (`recentMarginPercent === -5`) → suppressed
    - Trivially-low margin (`recentMarginPercent === 1.5`) → suppressed (below 2% threshold)
    - `NaN` `currentMonthlyRevenue` → suppressed (guard against upstream aggregation bug)
    - Zero `currentMonthlyRevenue` → emitted with `gap === breakEvenRevenue` (pre-revenue businesses get the full break-even target as their gap)
    - Confidence-tier boundary: `recentMarginPercent === 10, direction === 'expanding'` → `'high'`
    - Confidence-tier boundary: `recentMarginPercent === 10, direction === 'shrinking'` → `'moderate'`
    - Confidence-tier boundary: `recentMarginPercent === 5` → `'moderate'`
    - Confidence-tier boundary: `recentMarginPercent === 4.9` → `'low'`

22. **Seed validation snapshot regenerates with the new stat type** — Given the CI seed-validation pipeline from Story 7.2 snapshots the curation pipeline output for deterministic regression detection, when `StatType.BreakEven` lands, then the snapshot files under the seed-validation suite must regenerate (command: `pnpm --filter api test:seed-validation -- -u` or equivalent — the dev agent should check the current convention). Without regeneration, CI fails with a snapshot mismatch even though the behavior is intentional. Task 8.6 covers this.

20. **Integration test covers the end-to-end pipeline** — Given `apps/api/src/services/curation/index.test.ts`, when the test runs a burning-business fixture with `monthlyFixedCosts = 15_000` and 6 months of data producing `recentMarginPercent ≈ 20`, then `computeStats → scoreInsights → assembleContext` produces a prompt containing `Break-Even:` with the expected numeric values, `TransparencyMetadata.statTypes` includes `'break_even'`, `promptVersion` equals `'v1.5'`, and the assembled prompt string contains zero row-level labels (privacy regression guard — same pattern as Stories 8.1 and 8.2).

21. **UI test covers the Locked Insight flow end-to-end** — Given `DashboardShell.test.tsx` (or a new focused test file), when the dashboard is rendered with a margin-positive fixture and `monthlyFixedCosts == null`, then (a) the Locked Insight card is visible with "Enable Break-Even" copy, (b) submitting a valid value calls `PUT /api/org/financials` with the exact payload `{ monthlyFixedCosts: 15000 }`, (c) the card swaps to the rendered break-even insight after the mutation resolves and revalidation completes. Extends the fixture patterns in `LockedInsightCard.test.tsx` and `DashboardShell.test.tsx`.

## Tasks / Subtasks

- [x] **Task 1**: Add `StatType.BreakEven` + `BreakEvenDetails` + `BreakEvenStat` to curation types (AC: #1, #17)
  - [x] 1.1 Open `apps/api/src/services/curation/types.ts`. Add `BreakEven: 'break_even'` to the `StatType` const object.
  - [x] 1.2 Add `BreakEvenDetails` interface matching AC #1 shape: `{ monthlyFixedCosts: number, marginPercent: number, breakEvenRevenue: number, currentMonthlyRevenue: number, gap: number, confidence: 'high' | 'moderate' | 'low' }`.
  - [x] 1.3 Add `BreakEvenStat extends BaseComputedStat` with `statType: 'break_even'` and `details: BreakEvenDetails`.
  - [x] 1.4 Add `BreakEvenStat` to the `ComputedStat` discriminated union. TypeScript's exhaustive-case-check will flag every unreachable `switch` branch in `scoring.ts`, `assembly.ts`, `validator.ts`, and tests — the compiler is the linter.
  - [x] 1.5 Update `types.ts_explained.md` (interview-docs ALWAYS ON).

- [x] **Task 2**: `computeBreakEven` in computation layer (AC: #2, #3, #4, #5, #6, #7)
  - [x] 2.1 Open `apps/api/src/services/curation/computation.ts`. Add `function computeBreakEven(marginStats: MarginTrendStat[], monthlyFixedCosts: number | null | undefined, currentMonthlyRevenue: number): BreakEvenStat[]` near `computeMarginTrend` (the actual file location around line 280–340).
  - [x] 2.2 Guard order (early-return on each):
    1. If `marginStats.length === 0` → `return []` (AC #3 — no margin signal)
    2. If `monthlyFixedCosts == null || monthlyFixedCosts === 0` → `return []` (AC #4 — covers `undefined`, `null`, and `0`)
    3. If `!Number.isFinite(currentMonthlyRevenue)` → `return []` (guard against upstream NaN)
    4. If `margin.recentMarginPercent <= 0` → `return []` (AC #5 — non-positive margin is nonsense)
    5. If `margin.recentMarginPercent < 2` → `return []` (AC #6 — trivially-low margin produces implausible break-even)
  - [x] 2.3 Compute `breakEvenRevenue = monthlyFixedCosts / (marginPercent / 100)`. Round to whole dollars. Critical: ALWAYS divide `marginPercent` by 100 first — `recentMarginPercent` is in 22.5=22.5% form (see Latest Technical Specifics). Forgetting the `/100` produces a break-even revenue 100× too small, which passes type-shape tests but fails the integration test.
  - [x] 2.4 Compute `gap = breakEvenRevenue - currentMonthlyRevenue`. Preserve sign (positive = below break-even, negative = above).
  - [x] 2.5 Derive `confidence` per AC #7's deterministic mapping. Helper: `function breakEvenConfidence(marginPercent: number, direction: MarginTrendDetails['direction']): 'high' | 'moderate' | 'low'` — pure, trivially testable.
  - [x] 2.6 Return `[{ statType: 'break_even', category: null, value: breakEvenRevenue, details: {...} }]` — single-element array, matching the `computeRunway` return shape.
  - [x] 2.7 **Wire into `computeStats()` — exact edit required.** Current state at `computation.ts:540-554`: `cashFlowStats` and `runwayStats` are computed eagerly to local variables; `computeMarginTrend(rows)` is inside the return spread. `computeBreakEven` needs `marginStats` (not inside a spread) and `currentMonthlyRevenue` (aggregated from rows once, used as a scalar). The edit pattern, mirroring the existing `cashFlowStats`/`runwayStats` idiom:
    ```ts
    const cashFlowStats = computeCashFlow(rows, cashFlowWindow);
    const runwayStats = computeRunway(cashFlowStats, opts?.financials, opts?.now);
    const marginStats = computeMarginTrend(rows);
    const currentMonthlyRevenue = latestMonthlyRevenue(rows); // helper defined in 2.7.1
    const breakEvenStats = computeBreakEven(marginStats, opts?.financials?.monthlyFixedCosts, currentMonthlyRevenue);

    return [
      ...computeTotals(...), ...computeAverages(...), ...computeTrends(...),
      ...detectAnomalies(...), ...computeCategoryBreakdowns(...),
      ...computeYearOverYear(rows),
      ...marginStats,                    // was: ...computeMarginTrend(rows)
      ...computeSeasonalProjection(rows),
      ...cashFlowStats,
      ...runwayStats,
      ...breakEvenStats,                 // new
    ];
    ```
  - [x] 2.7.1 Define `latestMonthlyRevenue(rows: DataRow[]): number` as a private helper alongside `computeBreakEven`. Aggregates `row.amount` where `row.parentCategory === 'Income'`, grouped by `YYYY-MM`, returns the revenue of the most recent month. Mirrors the aggregation in `computeMarginTrend` (`computation.ts:287-297`) — the code is nearly identical but returns a scalar instead of a map. Returns `0` for empty input so `computeBreakEven`'s `gap` equals `breakEvenRevenue` for pre-revenue businesses (AC #19 covers this case).
  - [x] 2.7.2 Do NOT source `currentMonthlyRevenue` from `CashFlowStat.details.recentMonths`. CashFlow suppresses for near-break-even businesses (`|net| < 5% of avg revenue`), which would silently also suppress BreakEven for healthy orgs — defeating AC #9's reassuring framing path.
  - [x] 2.8 Update the two call sites that pass `financials` through — `apps/api/src/services/curation/index.ts` (`runCurationPipeline` → `runFullPipeline`, already has `businessProfile` in scope from 8.2) and `apps/api/src/db/seed.ts` (already passes `financials` or `null` from 8.2). Concrete assertion for Task 10.2 covers the wiring: the end-to-end fixture must emit break-even when `monthlyFixedCosts` is set. If that assertion fails, the thread is broken.
  - [x] 2.9 Do NOT add a `DataRow[]` parameter to `computeBreakEven` itself — privacy boundary is non-negotiable. The helper `latestMonthlyRevenue(rows)` DOES take `DataRow[]` because it's colocated in `computation.ts` where row-level work is allowed; the scalar it returns is what flows into `computeBreakEven`.
  - [x] 2.10 Update `computation.ts_explained.md`.

- [x] **Task 3**: Scoring for `StatType.BreakEven` (AC: #8, #9)
  - [x] 3.1 Open `apps/api/src/services/curation/scoring.ts`. Add `case StatType.BreakEven` to all three score functions — TypeScript's exhaustive-case-check will error until you do.
  - [x] 3.2 `actionabilityScore`: return `0.88` when `gap > 0` (below break-even, revenue push is actionable); `0.55` otherwise.
  - [x] 3.3 `noveltyScore`: return `0.75` when `gap > 0`; `0.60` otherwise. Above-break-even is reassuring but not novel.
  - [x] 3.4 `specificityScore`: return `0.85` flat. Lower than runway (0.90, exact month count) because break-even is a revenue target and targets are inherently fuzzier than counts.
  - [x] 3.5 Verify under default weights that critical break-even (`gap > 0`) totals exactly `0.35 × 0.75 + 0.40 × 0.88 + 0.25 × 0.85 = 0.8270`. Test via `expect(total).toBeCloseTo(0.8270, 4)` (hardcode the exact value, 4 decimals — same regression-guard pattern from Story 8.1 code review).
  - [x] 3.6 Document the intentional ranking inline: `// Scoring order: Runway critical (0.9025) > CashFlow burning (0.8400) > BreakEven gap-positive (0.8270). Runway leads because it carries the most urgent signal (existential timeline). Burning follows because a binary urgency cue should precede a quantified target. BreakEven trails by design — it refines the burn signal rather than originating one. If any score flips the order here, a weight was tuned and both rationales need review.`

- [x] **Task 4**: Assembly + prompt template v1.5 (AC: #10, #11, #18)
  - [x] 4.1 Open `apps/api/src/services/curation/assembly.ts`. Add `case StatType.BreakEven` to `formatStat()` matching AC #10 shape. Example line: `- [Overall] Break-Even: $42,000/mo at 20.0% margin — current revenue $31,000/mo, gap $11,000 (confidence: high, relevance: 0.83)`.
  - [x] 4.2 Reuse the existing `usd` formatter at the top of `assembly.ts`. Format `marginPercent` with `.toFixed(1)`. Sign the `gap` — positive displays as plain, negative as `-$X,XXX`.
  - [x] 4.3 Create `apps/api/src/services/curation/config/prompt-templates/v1.5.md`. Copy `v1.4.md` verbatim as the starting point, then add the four framing rules from AC #11:
    1. Break-even framing rule (below break-even, descriptive not prescriptive)
    2. Above-break-even framing rule (brief, reassuring, not boastful)
    3. Runway-BreakEven dedup rule (runway first, break-even second, don't repeat fixed-costs figure)
    4. Low-confidence hedge rule (soften language under 5% margin)
  - [x] 4.4 Bump `DEFAULT_VERSION` in `assembly.ts` from `'v1.4'` to `'v1.5'`. This cache-invalidates `ai_summaries` rows keyed on `v1.4`. **Deploy-cost note:** on the first summary request per org after deploy, the full LLM generation runs against Claude (no cache hit). Expect a one-time token-cost bump proportional to DAU × active-orgs. Not a blocker, just calendar-aware — if the cost matters, deploy during low-traffic hours.
  - [x] 4.5 Update existing tests that hardcode `promptVersion === 'v1.4'`. **Expected count: 5 occurrences** across `apps/api/src/services/curation/` — one in `assembly.test.ts`, four in `index.test.ts` (verified via grep 2026-04-21). Run `grep -rn "'v1.4'" apps/api/src/services/curation/` before editing to confirm current count; Story 8.5 may have added more after this story was drafted. If the count keeps climbing across stories, extract `DEFAULT_VERSION` as an exported constant imported into tests — flag that refactor for a future story, don't land it here.
  - [x] 4.6 Add `break_even: 'Break-Even'` to `STAT_TYPE_LABELS` in `apps/web/app/dashboard/TransparencyPanel.tsx` (AC #18).
  - [x] 4.7 Update `assembly.ts_explained.md` and `TransparencyPanel.tsx_explained.md`.

- [x] **Task 5**: Extend Tier 1 validator for break-even (AC: #12)
  - [x] 5.1 Open `apps/api/src/services/curation/validator.ts`. Add `case StatType.BreakEven` to `classifyStatNumbers()` (the function is at the top of the file around line 47; locate by name, line numbers drift across stories). Mirror the existing `case StatType.Runway` block added in 8.2.
  - [x] 5.2 Push `stat.details.breakEvenRevenue` and `stat.details.monthlyFixedCosts` into the currency allowed-set. `currentMonthlyRevenue` is already covered by existing revenue-stat classifications (Total/Average), but add it explicitly to the break-even branch for defensive coverage.
  - [x] 5.3 Do NOT push `stat.details.gap` — it's already expressible as a pairwise sum/difference via the pairwise-tolerance loop later in the file (locate by the comment "pairwise sums and differences within currency"). An explicit push would mask the pairwise tolerance check in tests.
  - [x] 5.4 Do NOT touch `stat.details.marginPercent` here — percent tokens for margin are already covered by `StatType.MarginTrend` case. Adding it again would be duplicative.
  - [x] 5.5 No code change needed in `streamHandler.ts` — emission flows through the existing `trackEvent('ai.summary_validation_flagged', ...)` call (same as Runway in 8.2).
  - [x] 5.6 Update `validator.ts_explained.md` with the BreakEven case and the known `gap` pairwise-sum tolerance caveat.

- [x] **Task 6**: Settings form — add `monthlyFixedCosts` field (AC: #15)
  - [x] 6.1 Open `apps/web/app/settings/financials/FinancialsForm.tsx`. Add a `monthlyFixedCosts` numeric input alongside the existing `cashOnHand` and `businessStartedDate` fields. Current form structure: state hooks at the top, a `submit` handler around line 50, form JSX below. Mirror the `cashOnHand` pattern for state + masking + parsing.
  - [x] 6.2 Use the same currency-mask helper already used for `cashOnHand` (format on blur as `$12,345`, strip on focus). Validate: non-negative number, ≤ `9_999_999`. Allow empty (optional field).
  - [x] 6.3 **Match the existing payload idiom exactly.** `FinancialsForm.tsx:58-62` uses:
    ```ts
    const updates: Partial<OrgFinancials> = {};
    if (parsedCash != null && parsedCash > 0) updates.cashOnHand = parsedCash;
    if (started) updates.businessStartedDate = started;
    ```
    Add the parallel line: `if (parsedFixedCosts != null && parsedFixedCosts >= 0) updates.monthlyFixedCosts = parsedFixedCosts;`. Note the `>= 0` (not `> 0`) — a business with zero fixed costs is rare but valid, and we don't want to silently drop a legitimate `0` entry.
  - [x] 6.4 **Clear-value UX gap — acknowledged limitation.** The current idiom has no way to set a field back to `null` (only to update or skip). If the owner wants to clear a previously-set `monthlyFixedCosts`, they can't via this form. Flag this in `FinancialsForm.tsx_explained.md` as a known limitation — the product decision is that clearing is rare enough to defer. If a use case surfaces, add an explicit "Clear" button that sends `{ monthlyFixedCosts: null }` and extends the schema's server-side handling.
  - [x] 6.5 **"Don't know" affordance.** Many owners lump rent, salaries, software in their head but have never written a single "monthly fixed costs" number. Under the input, render a small helper text: `Common examples: rent, salaries, software subscriptions, insurance. Rough estimates are fine — you can update anytime.` This reduces abandonment and matches the 8.2 pattern of explicit-over-implicit UX guidance.
  - [x] 6.6 Do NOT auto-set a "fixedCostsAsOfDate" field. `monthlyFixedCosts` is set-and-forget; staleness isn't a meaningful signal here (unlike cash balance).
  - [x] 6.7 Update `FinancialsForm.tsx_explained.md` — note the differing temporal semantics between `cashOnHand` (time-sensitive, snapshot-tracked) and `monthlyFixedCosts` (quasi-static, overwritten on change), and document the clear-value limitation.
  - [x] 6.8 UI test: open the form with a fixture that has `monthlyFixedCosts: 10_000`, assert the masked value displays as `$10,000`; submit a changed value, assert the PUT payload contains `monthlyFixedCosts`. Add a test asserting `monthlyFixedCosts: 0` submits (the `>= 0` path), and a test asserting a blank input skips the field entirely (the `!= null` gate).

- [x] **Task 7**: Dashboard wiring — Locked Insight for missing fixed costs (AC: #13, #14, #16)
  - [x] 7.1 Open `apps/web/app/dashboard/DashboardShell.tsx` (the existing SWR fetch of `/api/org/financials` from 8.2 is already in place around `DashboardShell.tsx:253-280`, with the runway Locked Insight render block around lines 421-429). Add a second detection condition: `needsBreakEvenEnable = hasMarginSignal && financials !== undefined && financials?.monthlyFixedCosts == null`.
  - [x] 7.2 **Add `hasMarginSignal` to `/api/dashboard/charts` response.** Open `apps/api/src/routes/dashboard.ts` (route handler at `dashboardRouter.get('/dashboard/charts', ...)`). Compute `hasMarginSignal` deterministically from the rows the handler already has in scope: aggregate rows by `YYYY-MM`, count months with both `Income` and `Expenses` present with non-zero revenue, and return `true` iff that count is `>= 4` (the same threshold `computeMarginTrend` uses to emit). Return it as `data.hasMarginSignal: boolean` alongside the existing chart payload. This avoids coupling the Locked Insight card to AI-summary streaming — the signal is deterministic and available on first dashboard load.
  - [x] 7.2.1 Why not derive from the AI summary's `TransparencyMetadata.statTypes`: a fresh user with >4 months of data but no summary yet would see no card (the summary hasn't streamed). Task 7.2's approach sidesteps the race entirely.
  - [x] 7.3 When `needsBreakEvenEnable` is true, inject a `<LockedInsightCard>` below the existing runway Locked Insight (if any) with props: `title="Enable Break-Even Analysis"`, `description="Add your monthly fixed costs to see the revenue you need to cover them at your current margin."`, `inputLabel="Monthly fixed costs"`, `inputMask="currency"`, `inputMax={9_999_999}`, `onSubmit={saveMonthlyFixedCosts}`.
  - [x] 7.4 `saveMonthlyFixedCosts` handler: PUT `/api/org/financials` with `{ monthlyFixedCosts: value }`, on success call `router.refresh()` so the next pipeline run emits the stat.
  - [x] 7.5 Do NOT store financial-baseline values in React state beyond the input's local form state — the source of truth is the server, and re-render should reflect the freshly written value via SWR revalidation + `router.refresh()`.
  - [x] 7.6 Order of Locked Insight cards in the feed, when multiple apply:
    1. Runway (existential — cash burn over time)
    2. Break-Even (revenue target — also existential but secondary to runway)
    Reflects the scoring hierarchy. If both are locked simultaneously the owner fills them top-down.
  - [x] 7.7 Update `DashboardShell.tsx_explained.md` and `dashboard.ts_explained.md`.

- [x] **Task 8**: Unit tests — `computeBreakEven` (AC: #19, #22)
  - [x] 8.1 Open `apps/api/src/services/curation/computation.test.ts`. Add `describe('computeBreakEven', ...)` block with all 17 fixtures from AC #19 (15 original + `undefined monthlyFixedCosts` + `NaN currentMonthlyRevenue` + zero-revenue case).
  - [x] 8.2 Build `MarginTrendStat` inputs directly (don't chain through `computeMarginTrend` — keep the unit test focused on the `computeBreakEven` branching).
  - [x] 8.3 Type-predicate filter when asserting: `all.filter((s): s is BreakEvenStat => s.statType === 'break_even')` — matches the Runway test pattern from 8.2.
  - [x] 8.4 Verify typed details shape: `BreakEvenDetails` fields all present with correct types and signs — same structural-check pattern as Story 8.2 Task 14.
  - [x] 8.5 Separate `describe('breakEvenConfidence', ...)` block for the pure helper — cover the direction-override cases explicitly via the decision table in AC #7.
  - [x] 8.6 **Regenerate seed-validation snapshots** (AC #22). After adding `computeBreakEven`, the CI seed-validation suite will produce additional output in its snapshot files. Run the snapshot-update command (check current convention in `package.json` — usually `pnpm --filter api test -- -u` or a dedicated `test:seed-validation` script) and commit the regenerated snapshots in the same commit as the computation. Without this, CI fails with a snapshot mismatch even though the behavior is intentional.

- [x] **Task 9**: Scoring tests (AC: #8, #9)
  - [x] 9.1 Open `apps/api/src/services/curation/scoring.test.ts`. Add cases:
    - `gap > 0` (below break-even) — asserts total score `toBeCloseTo(0.8270, 4)` exactly
    - `gap === 0` (exactly at break-even) — asserts demoted band
    - `gap < 0` (above break-even) — asserts demoted band, same score as `gap === 0`
    - Monotonicity: runway (critical) > break-even (gap positive) > cash-flow burning — assert runway beats break-even, break-even beats a plain `CashFlow break_even` stat (not burning — burning is higher); document the runway > burning > break-even hierarchy explicitly in the test description.
  - [x] 9.2 Verify config tunability: adjust weights, assert scores shift predictably (same pattern as Stories 8.1 and 8.2).

- [x] **Task 10**: Integration test — end-to-end pipeline (AC: #20)
  - [x] 10.1 Open `apps/api/src/services/curation/index.test.ts`. Add `describe('Break-Even end-to-end', ...)` block with a below-break-even fixture: 6 months of CSV rows producing `recentMarginPercent ≈ 20`, `monthlyFixedCosts = 15_000`, `currentMonthlyRevenue ≈ 50_000`. Expected break-even revenue = 75,000; expected gap = 25,000.
  - [x] 10.2 Run the full pipeline: `computeStats → scoreInsights → assembleContext`. Assert:
    - Final prompt text matches `/Break-Even:\s+\$75,000\/mo/`
    - Final prompt text matches `/at 20\.0% margin/`
    - Final prompt text matches `/gap \$25,000/`
    - `TransparencyMetadata.statTypes` includes `'break_even'`
    - `TransparencyMetadata.promptVersion` equals `'v1.5'`
    - Identifiable row labels from the fixture (reuse the existing 8.1/8.2 labels: `'Acme Corp invoice #4218'`, `'Main St landlord wire'`) appear ZERO times in the assembled prompt (privacy regression guard).
  - [x] 10.3 Add a second fixture: same margin and fixed costs but `currentMonthlyRevenue = 100_000` (above break-even) → assert the prompt contains a reassuring framing marker (e.g., `covering your fixed costs` or `above break-even`).

- [x] **Task 11**: Validator tests (AC: #12)
  - [x] 11.1 Open `apps/api/src/services/curation/validator.test.ts`. Add cases aligned with the actual currency-and-percent scanner:
    - LLM output quoting the exact `breakEvenRevenue` → no flag (in allowed-set)
    - LLM output quoting the exact `monthlyFixedCosts` → no flag (in allowed-set)
    - LLM output with a fabricated `breakEvenRevenue` far from any pairwise combination → flagged
    - LLM output quoting `gap` that matches `breakEvenRevenue - currentRevenue` → NOT flagged (pairwise tolerance; document as expected)
    - LLM output mentioning a plausible `marginPercent` → not flagged (already covered by `MarginTrend` classification)
    - Event-name sanity check: `trackEvent('ai.summary_validation_flagged', ...)` is the canonical name (dot, not underscore) — reuse the assertion pattern from `streamHandler.test.ts:219`.

- [x] **Task 12**: UI integration test — dashboard Locked Insight flow (AC: #21)
  - [x] 12.1 Open or create a test file in `apps/web/app/dashboard/` targeting the dashboard wiring. Fixture: AI summary metadata includes `margin_trend` in `statTypes`, `financials` is fetched but `monthlyFixedCosts == null`.
  - [x] 12.2 Assert the "Enable Break-Even Analysis" card renders in the expected DOM position (use `getByRole` + accessible name queries, not CSS selectors).
  - [x] 12.3 Submit a valid value (`15000`); assert `PUT /api/org/financials` was called with `{ monthlyFixedCosts: 15000 }` (exact number, not string).
  - [x] 12.4 Negative case: fixture with `margin_trend` NOT in `statTypes` — assert the card does NOT render even when `monthlyFixedCosts == null` (AC #14).
  - [x] 12.5 Settle on either a new focused test file (`DashboardBreakEven.test.tsx`) or expand `DashboardShell.test.tsx` — the dev agent's call based on the existing test structure. 8.2 Task 17 deferred the full dashboard integration test for scope reasons; same pragmatism applies here if the existing test file would balloon.

- [x] **Task 13**: Project-context.md update (ALWAYS ON: interview-docs)
  - [x] 13.1 Append to the Financial Baseline section in `_bmad-output/project-context.md`: "Break-even revenue is computed from `MarginTrend.details.recentMarginPercent` + `monthlyFixedCosts`. Both must be present and margin must exceed 2% or the stat suppresses. `computeBreakEven` consumes pre-aggregated stats — never `DataRow[]` — same privacy pattern as `computeRunway`."
  - [x] 13.2 Append to the Locked Insight pattern notes: "Break-Even and Runway are the first two consumers. The UI pattern scales to any owner-input-gated stat — adding a third (e.g., inventory turnover) means a new computation, a new detection flag in `DashboardShell`, and a new `<LockedInsightCard>` instance; the component itself requires no change."
  - [x] 13.3 Append to the Prompt Versioning section: "`v1.5` adds break-even framing. Cache invalidates on next read of any `v1.4`-keyed row. Prior versions preserved for cache-replay compatibility."

- [x] **Task 14**: Sprint status transitions
  - [x] 14.1 Entry already exists in `_bmad-output/implementation-artifacts/sprint-status.yaml` as `ready-for-dev` (set at story creation time).
  - [x] 14.2 Status transitions across the cycle:
    - `ready-for-dev` → `in-progress` — dev agent flips on first `/bmad-bmm-dev-story` invocation
    - `in-progress` → `review` — dev agent flips when implementation + tests land, before code review
    - `review` → `done` — code-review workflow flips on 0 must-fix convergence (per the code-review convergence preference in user memory — iterate to 0 must-fix, then commit)
  - [x] 14.3 The dev agent and code-review workflow own their respective transitions. No manual story-author edits to sprint-status after initial creation.

## Dev Notes

### Starting State — Pre-existing Scaffold

Almost everything is already in place from Story 8.2. This story adds domain logic on top of an existing structure.

Current state of relevant touchpoints (verified at story creation, 2026-04-21):
- `packages/shared/src/schemas/businessProfile.ts:48` — `monthlyFixedCosts: z.number().nonnegative().optional()` already present (added in 8.2 Task 1 for forward-compatibility)
- `packages/shared/src/schemas/businessProfile.ts:59` — `orgFinancialsSchema.shape` already includes `monthlyFixedCosts`
- `apps/api/src/routes/orgFinancials.ts` — `PUT /api/org/financials` accepts `monthlyFixedCosts` through `orgFinancialsSchema` validation (no code change needed)
- `apps/api/src/db/queries/orgFinancials.ts` — `updateOrgFinancials` already performs the JSONB merge via `business_profile || $::jsonb`; new field flows through the merge without code change
- `apps/api/src/services/curation/assembly.ts:12` — `DEFAULT_VERSION = 'v1.4'` (after Story 8.5 bump)
- `apps/api/src/services/curation/assembly.ts:13` — `usd` formatter: `new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })`. Reuse verbatim.
- `apps/api/src/services/curation/config/prompt-templates/` — contains `v1.md`, `v1.1.md`, `v1.2.md`, `v1.3.md`, `v1.4.md`, `v1-digest.md`
- `apps/api/src/services/curation/types.ts:10` — `StatType.MarginTrend = 'margin_trend'` (existing); `BreakEven` will be the 11th stat type
- `apps/api/src/services/curation/types.ts:63-69` — `MarginTrendDetails` shape: `{ recentMarginPercent, priorMarginPercent, direction, revenueGrowthPercent, expenseGrowthPercent }`
- `apps/api/src/services/curation/computation.ts:283-337` — `computeMarginTrend` body. Line 313 computes `recentMarginPercent = ((recentRevenue - recentExpense) / recentRevenue) * 100` — 22.5 means 22.5%. Divide by 100 before the break-even division.
- `apps/api/src/services/curation/computation.ts:540-554` — `computeStats` return block. Current order: `cashFlowStats` + `runwayStats` computed eagerly; `computeMarginTrend(rows)` is inside the spread. The pattern in Task 2.7 matches this existing idiom.
- `apps/api/src/services/curation/validator.ts:47` — `classifyStatNumbers()` function start. Line numbers drift across stories; locate by name.
- `apps/api/src/routes/dashboard.ts:42` — `dashboardRouter.get('/dashboard/charts', ...)` handler. Task 7.2 extends its response with `hasMarginSignal`.
- `apps/web/app/dashboard/LockedInsightCard.tsx:7-17` — prop shape: `{ title, description, inputLabel, inputMask, inputMax, onSubmit }`. No external `error` or `loading` props (component manages both internally). Task 7.3's props match this.
- `apps/web/app/dashboard/DashboardShell.tsx:253-280` — SWR fetch of `/api/org/financials`. Lines 421-429 render the runway Locked Insight. Add break-even detection + render as a second block mirroring that pattern.
- `apps/web/app/settings/financials/FinancialsForm.tsx:27-62` — existing form: state hooks for `cash`, `started`, `asOf`; `submit` handler at line 52 builds the `updates` object with the `if (parsed != null && parsed > 0) updates.X = ...` idiom; Task 6.3 mirrors this pattern exactly.

What does NOT exist yet:
- Any `computeBreakEven` function
- `StatType.BreakEven` in the enum
- `v1.5.md` prompt template
- Any validator coverage for break-even
- Any dashboard detection logic for break-even's missing-input state

### Architecture Compliance

**Three-Layer Curation Pipeline** (from Stories 3.1/3.2, extended by 8.1/8.2):
- Layer 1 — `computation.ts`: `computeBreakEven` is the second stat after `computeRunway` that does NOT touch `DataRow[]` directly. It consumes `MarginTrendStat[]` and two scalars. Compliant with the privacy boundary.
- Layer 2 — `scoring.ts`: adds a `case StatType.BreakEven` to the three scorers.
- Layer 3 — `assembly.ts`: adds a new `formatStat` case + prompt version bump to `v1.5`.

**Privacy Boundary (NON-NEGOTIABLE)** — enforced by TypeScript discriminated union:
- `computeBreakEven` MUST NOT accept `DataRow[]`. It accepts `MarginTrendStat[]` + `monthlyFixedCosts` + `currentMonthlyRevenue` (pre-aggregated).
- `BreakEvenDetails` carries only numbers and a confidence enum. No row IDs, no row references, no transaction descriptions.
- The Tier 1 hallucination validator does NOT need `DataRow[]` either — it compares LLM output against `BreakEvenStat.details.*`, which is already at the aggregated layer.

**Aggregation-identifiability edge case** — like `RunwayDetails`, `BreakEvenDetails` is a set of scalars derived from already-aggregated inputs. Identifiability risk is strictly lower than `CashFlowDetails.recentMonths` (which carries per-month revenue/expenses). No new invariant needed.

**Suppression is editorial judgment** — returning `[]` from `computeBreakEven` is not an error path. It's the system declining to say something when it has no honest way to. Six explicit suppression cases (AC #3, #4, #5, #6, plus the implicit no-margin and negative-margin branches) all emit `[]` — none throw. Stories 8.1 and 8.2 established this pattern; 8.3 continues it.

**BFF proxy pattern** — unchanged. The `PUT /api/org/financials` endpoint is reused. No new CORS middleware (CLAUDE.md rule).

**Transactional consistency** — `updateOrgFinancials` is already transactional (Story 8.2 Task 3). Adding `monthlyFixedCosts` to the update payload flows through the existing JSONB merge. No new transactional boundary.

### Library & Framework Requirements

No new external dependencies. All libraries already in the workspace:

- **Zod 3.x** — no schema changes (already done in 8.2). Reuses existing `orgFinancialsSchema` validation on the route.
- **Drizzle ORM 0.45.x** — no new tables or queries. Existing `updateOrgFinancials` handles the field through JSONB merge.
- **`simple-statistics` 7.8.x** — not needed. `computeBreakEven` is division and comparison.
- **Vitest** — existing test framework. Tests co-located as `*.test.ts` / `*.test.tsx`.
- **Next.js 16** — no new routes. Reuses `/settings/financials` page from 8.2.
- **Tailwind CSS 4** — no new components. Reuses `LockedInsightCard` from 8.2.

### File Structure Requirements

Files to modify:

| File | Change |
|------|--------|
| `apps/api/src/services/curation/types.ts` | Add `BreakEven` enum + `BreakEvenDetails` + `BreakEvenStat` |
| `apps/api/src/services/curation/computation.ts` | Add `computeBreakEven` + `breakEvenConfidence` helper + `latestMonthlyRevenue` helper; edit `computeStats` return block per Task 2.7 |
| `apps/api/src/services/curation/scoring.ts` | Add `BreakEven` cases to three scorers |
| `apps/api/src/services/curation/assembly.ts` | Add `BreakEven` case to `formatStat`; bump `DEFAULT_VERSION` `'v1.4'` → `'v1.5'` |
| `apps/api/src/services/curation/validator.ts` | Extend `classifyStatNumbers` with `case StatType.BreakEven` |
| `apps/api/src/services/curation/index.ts` | Ensure `monthlyFixedCosts` flows through `runCurationPipeline` (may already work via existing `financials` thread) |
| `apps/api/src/db/seed.ts` | Pass seed-appropriate `monthlyFixedCosts` where it already passes `financials` |
| `apps/api/src/routes/dashboard.ts` | Extend `GET /dashboard/charts` response with `hasMarginSignal: boolean` |
| `apps/api/src/services/curation/computation.test.ts` | 17 new fixtures for `computeBreakEven` + helper tests |
| `apps/api/src/services/curation/scoring.test.ts` | 4 new scoring tests + monotonicity |
| `apps/api/src/services/curation/assembly.test.ts` | Update `v1.4` → `v1.5` assertion |
| `apps/api/src/services/curation/index.test.ts` | 2 new end-to-end tests; update 4 `v1.4` → `v1.5` assertions |
| `apps/api/src/services/curation/validator.test.ts` | 5 new validator cases |
| `apps/api/src/routes/dashboard.test.ts` | Add `hasMarginSignal` assertion (true for ≥4-month fixture, false for <4-month fixture) |
| Seed-validation snapshot files | Regenerate per Task 8.6 (command TBD from `package.json`) |
| `apps/web/app/dashboard/TransparencyPanel.tsx` | Add `break_even: 'Break-Even'` to `STAT_TYPE_LABELS` |
| `apps/web/app/dashboard/DashboardShell.tsx` | Second Locked Insight injection (break-even) gated on `hasMarginSignal && !monthlyFixedCosts` |
| `apps/web/app/settings/financials/FinancialsForm.tsx` | Add `monthlyFixedCosts` input with currency mask + helper text + matching payload idiom |
| `_bmad-output/project-context.md` | Append break-even rules to Financial Baseline + Locked Insight + Prompt Versioning sections |

Files added (net new):

| File | Purpose |
|------|---------|
| `apps/api/src/services/curation/config/prompt-templates/v1.5.md` | Prompt template extending v1.4 with break-even framing + dedup + hedge rules |

Files NOT to modify:

- `apps/api/src/services/curation/config/prompt-templates/v1.md`, `v1.1.md`, `v1.2.md`, `v1.3.md`, `v1.4.md` — preserve for cache-replay compatibility (same reasoning as Stories 8.1 and 8.2)
- `apps/api/src/db/schema.ts` — no new table; `monthlyFixedCosts` lives in the existing `orgs.businessProfile` JSONB
- `apps/api/src/routes/orgFinancials.ts` — no new endpoint; `monthlyFixedCosts` flows through `orgFinancialsSchema`
- `apps/api/src/db/queries/orgFinancials.ts` — no new query; `updateOrgFinancials` handles the field through the existing merge
- `apps/web/app/dashboard/LockedInsightCard.tsx` — reused, not modified
- `apps/web/proxy.ts` — no new protected routes
- `apps/api/src/middleware/roleGuard.ts` — reused, not modified
- `apps/api/src/lib/rls.ts` — reused, not modified
- `apps/api/drizzle/migrations/` — no new migration

### Testing Requirements

- **Framework:** Vitest. Run `pnpm --filter api test` for API tests, `pnpm --filter web test` for web tests. CI runs both.
- **Co-location:** tests sit next to source as `*.test.ts` / `*.test.tsx`.
- **Coverage expectations:** every branch in `computeBreakEven` must have a fixture (AC #19 — 15 fixtures). The suppression branches are the most failure-prone — cover them first. Every score function case for `StatType.BreakEven` must have a test with an exact-value assertion (`toBeCloseTo(0.8270, 4)` — same regression-guard pattern from 8.1 and 8.2).
- **Date mocking:** not required for break-even — the computation is time-independent. Unlike runway, there's no staleness window. Confidence depends on margin-percent thresholds, not on dates.
- **Fixture pattern:** follow `computeRunway` fixtures in `computation.test.ts` — they're the closest precedent. Build `MarginTrendStat[]` directly rather than chaining through `computeMarginTrend` (keep the unit test focused on `computeBreakEven` branching).
- **Integration test:** end-to-end pipeline test in `index.test.ts` must assert the privacy invariant (`expect(prompt).not.toContain('Acme Corp invoice')` and similar). Same pattern as Stories 8.1 and 8.2.
- **UI tests:** use `@testing-library/react` accessible queries (`getByRole`, `getByLabelText`) — not CSS selectors. Axe-core integration from Epic 7 means components must pass a11y checks on render.
- **Test suite delta target:** ~28–32 new tests across computation (15 fixtures + helper), scoring (4 cases + monotonicity), assembly (1 case + version updates), validator (5 cases), integration (2 cases), UI (4 cases). Current total is ~1076 per Story 8.2 Change Log — this story should land around 1104–1108.

### Previous Story Intelligence (from Stories 3.2, 8.1, 8.2, 8.5)

Dev notes and learnings that shape this story:

- **Prompt template version bump cascade** — each story in the cash-flow arc bumps `DEFAULT_VERSION`. v1 → v1.1 (Story 8.1), v1.1 → v1.3 (Story 8.2, promoting v1.2 in the chain), v1.3 → v1.4 (Story 8.5). Story 8.3 bumps v1.4 → v1.5. Each bump cache-invalidates `ai_summaries` rows keyed on the prior version, so users get the new framing on their next summary. Prior templates stay on disk for cache-replay compatibility.
- **Score parity regressions bite hard** — Story 8.1's code review caught a 0.03 score inversion. The fix is to hardcode exact totals and assert `toBeCloseTo(..., 4)`. Apply the same discipline to break-even scoring. Document the monotonicity invariant inline (runway > burning > break-even) and assert the exact total (0.8270) in tests.
- **Suppression over padding** — Stories 3.2, 8.1, 8.2 established: when a stat has nothing to say, emit `[]`. Break-even has six suppression cases — all must emit `[]`, none throw. A weak break-even insight ("your break-even is roughly $420k/mo at 0.5% margin") dilutes the top-N and steals a slot from something better.
- **Trivially-low margin suppression is editorial** — the 2% threshold in AC #6 is a judgment call, not a mathematical constraint. Document it inline: a 1% margin produces a break-even of `fixedCosts × 100`, which is misleading precision. Stories 8.1 used 5% for the `break_even` band in `CashFlow`; this story uses 2% for the lower bound of break-even computation — different thresholds for different concerns, both documented.
- **Validator pairwise-sum tolerance** — Story 8.2 Task 9.2 noted that the validator allows `actualValue ± anotherValue` combinations, which means a fabricated `gap` value close to `breakEvenRevenue - currentRevenue` may slip through. This is an acknowledged limitation. Do not add a dedicated `gap` push in `classifyStatNumbers` — that would mask the tolerance check.
- **TransparencyPanel labels are easy to miss** — Story 8.1 and 8.2 code reviews both surfaced missing label entries. Double-check Task 4.6. If `break_even` isn't in `STAT_TYPE_LABELS`, the panel renders `'break_even'` as a raw key.
- **Dashboard wiring order** — Story 8.2 injects the runway Locked Insight above the AI summary. Break-even stacks below runway when both apply. Order matches scoring priority: runway is existential, break-even is quantified-target.
- **`LockedInsightCard` prop surface held up** — Story 8.2 Task 10.1 designed the component with reuse in mind (no runway-specific copy). Story 8.3 is the first reuse test. If any new prop is needed, flag in the dev log — ideally the API stays stable across all future gated stats.
- **`_explained.md` companion docs are ALWAYS ON** — every new file gets one. Every substantially modified file gets its existing doc updated. See CLAUDE.md "Interview Documentation" section. Skip only for typo fixes, config-only tweaks, and pure boilerplate.
- **Commits are sole-authored** — Corey is the sole author. NO `Co-Authored-By` lines, NO `Generated with Claude Code`, NO `via Happy` lines (per `feedback_sole_author.md` memory).
- **Code-review convergence** — iterate `/code-review` until 0 must-fix findings, then commit (per `feedback_code_review_convergence.md` memory).

### Git Intelligence Summary

Recent commits on `main` (as of 2026-04-21):

- `338a696 chore(bmad): mark Story 8.5 as done — inline chart thumbnails shipped` — sprint status hygiene
- `da16f8b feat(ai): inline chart thumbnails + insight-to-chart mapping` — Story 8.5 implementation (prompt v1.3 → v1.4; 8.3 will bump v1.4 → v1.5)
- `a1b4f15 docs(story): Story 8.2 complete, Epic 8 arc refined, context updated` — epic 8 planning updates
- `96b48ca feat(ui): wire runway locked card, stale banner, financials settings` — Story 8.2 UI (pattern reference for 8.3)
- `39ba348 feat(ui): LockedInsightCard and CashBalanceStaleBanner components` — the reusable scaffold 8.3 consumes
- `1615f8f feat(ai): track validation-flagged summaries as analytics events` — Tier 1 validator (8.3 extends this)
- `a385d1d feat(ai): add Tier 1 hallucination validator for AI summaries` — validator first landed here

<!-- Commit sequence is a suggestion, not binding. The dev agent may batch or split as implementation reveals natural seams. Per the code-review convergence preference, commits typically land after /code-review converges to 0 must-fix. -->

Suggested commit sequence for 8.3 (smaller than 8.2's 8-commit split because less scope):

- `feat(curation): add BreakEven stat type with computation and scoring` — Tasks 1 + 2 + 3
- `feat(curation): render BreakEven in prompt v1.5 with dedup framing` — Tasks 4 + 5
- `feat(api): surface hasMarginSignal on dashboard charts response` — Task 7.2 (API side)
- `feat(ui): wire break-even locked card and settings input` — Tasks 6 + 7 (UI side)
- `test(break-even): end-to-end coverage for computation, scoring, validator, UI` — Tasks 8–12
- `docs(context): document break-even computation boundary and pattern reuse` — Task 13

Conventional commit prefixes per CLAUDE.md (feat/fix/refactor/test/docs, imperative mood, under 72 chars, body explains why not what).

### Latest Technical Specifics

- **`recentMarginPercent` unit** — `computeMarginTrend` at `computation.ts:313` computes `((revenue - expenses) / revenue) * 100`. So `22.5` means 22.5%. The break-even division is `monthlyFixedCosts / (marginPercent / 100)` — ALWAYS divide by 100 before dividing the fixed costs. Forgetting this factor produces a break-even revenue 100× too small, which passes all shape tests but fails the integration test.
- **Current-month revenue sourcing** — `computeMarginTrend` aggregates `revenueByMonth` internally but doesn't export it. Options for `currentMonthlyRevenue`: (a) refactor `computeMarginTrend` to return the aggregation, (b) re-aggregate in `computeStats` and pass explicitly, (c) derive from the most recent entry in `CashFlowStat.details.recentMonths`. Preference: (c) — CashFlow is already computed by the time `computeBreakEven` runs, and its `recentMonths` entries include per-month revenue. If the order of operations is CashFlow → MarginTrend → Runway → BreakEven, then `cashFlowStats[0]?.details.recentMonths.at(-1)?.revenue` is the clean source. If CashFlow is suppressed for the fixture, break-even also suppresses (no current-revenue signal). Document the dependency in `computation.ts_explained.md`.
- **Rounding discipline** — `breakEvenRevenue` and `gap` round to whole dollars. `marginPercent` rounds to 1 decimal (matches `MarginTrend`'s display). Never display a break-even of `$42,137.89` — the precision is false; the inputs are already rounded.
- **Pino structured logging** — no new emission points in this story. The existing validator event flow from `streamHandler.ts` covers break-even flag emissions automatically.
- **Next.js 16 revalidation** — `router.refresh()` after `PUT /api/org/financials` triggers a re-fetch of the dashboard's server-component data, which includes the AI summary. The refreshed summary reflects break-even.
- **React 19.2** — no new browser-API reads in this story. `LockedInsightCard` already handles currency masking; dashboard uses SWR for financials fetch. No `useSyncExternalStore` concerns.

### Project Context Reference

All rules in `/Users/Corey_Lanskey/Projects/portfolio/saas-analytics-dashboard/CLAUDE.md` apply. Non-obvious ones worth re-reading before starting:

- **No `process.env` in application code** — all env via `apps/api/src/config.ts`. This story doesn't touch config.
- **No `console.log`** — Pino structured logging only.
- **No CORS middleware** — BFF proxy pattern. Same-origin.
- **Import boundaries** — `apps/web` cannot import from `apps/api` (and vice versa). Cross-package imports go through `shared/schemas`, `shared/types`, `shared/constants`.
- **Services import from `db/queries/` barrel** — never `db/index.ts` directly. No new query barrel needed for this story.
- **Express middleware chain order** — unchanged. No new router.
- **Privacy-by-architecture** — `assembly.ts` accepts `ComputedStat[]`, not `DataRow[]`. Break-even reinforces this (consumes `MarginTrendStat` + scalars).
- **Error response shape** — `{ error: { code, message, details? } }`. No new error cases in this story.
- **humanize-code (ALWAYS ON)** — concise naming, early returns, no echo comments, no section-header comments. Read the existing `computeRunway` implementation as the tone reference.
- **interview-docs (ALWAYS ON)** — every new or substantially modified file gets a companion `_explained.md`. Update existing docs when modifying the source.
- **humanizer (ALWAYS ON)** — all prose must avoid banned vocabulary and banned patterns. Commit messages: conventional prefix, imperative mood, under 72 chars.

Also see:
- `_bmad-output/project-context.md` — Financial Baseline section from 8.2 (expand it, don't replace)
- `_bmad-output/planning-artifacts/architecture.md` — curation pipeline section, privacy boundary section
- `_bmad-output/implementation-artifacts/8-2-cash-balance-ux-runway-months.md` — closest precedent for 8.3. Read the full dev record before starting; the patterns, commit sequence, and test discipline transfer directly.

## Story Completion Status

- **Status:** ready-for-dev
- **Blocks:** Story 8.4 (Forward Cash Flow Forecast — can cite break-even in its narrative), GTM Week 3 weekly email digest (break-even is bullet 3 when burning)
- **Blocked by:** none — Story 8.2 (Runway + Locked Insight pattern + `org_financials` infrastructure) is `done`, which is the only hard prerequisite. Story 8.5 (prompt v1.4) is also `done` and sets the version floor to bump.
- **Estimated scope:** 2 days for a single developer. Breakdown: Task 1 + 2 + 3 (types + computation + `latestMonthlyRevenue` helper + scoring) = ~0.5 day; Task 4 + 5 (assembly v1.5 + validator) = ~0.25 day; Task 6 + 7 (settings input + dashboard wiring + `hasMarginSignal` API extension) = ~0.5 day; Task 8–12 (tests) = ~0.5–0.75 day. Slightly larger than the initial 1.5–2 day estimate after validation surfaced the need for a `hasMarginSignal` API-side change and the concrete `computeStats` edit pattern. Still dramatically smaller than 8.2 (3–4 days) because 8.2 front-loaded the scaffolding.
- **Validation owner:** Story validation completed 2026-04-21 in a fresh context (see Change Log v1.1). All critical findings addressed in v2.0.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context), via dispatched general-purpose subagent, 2026-04-21.

### Debug Log References

- **Pre-existing seed-validation drift** — the `scripts/validate-seed.ts` snapshot was stuck at `promptVersion: "v1"` and asserted `category_breakdown` in top-N. Actual top-N under current scoring weights since Epic 8 is `[anomaly, margin_trend, trend]` — category_breakdown gets displaced by trend (score 0.795 > breakdown 0.505) and margin_trend now lands in top-N. CI has been failing since Story 8.1 because of this stale snapshot. Resolved by: (a) updating phase 2 assertions to match current reality (`category_breakdown` → `margin_trend`, categoryCount floor 5 → 4), and (b) regenerating snapshot to `v1.5`. This is in-scope cleanup because Task 8.6 calls for snapshot regeneration and it would fail anyway post-bump.
- **`computeMarginTrend` return type narrowed** from `ComputedStat[]` to `MarginTrendStat[]` so `computeBreakEven` can consume it without a cast. Minor change; exhaustive case checks still pass.
- **`ChartData` schema extended** with optional `hasMarginSignal: z.boolean().optional()`. Optional so existing tests pass without fixture updates; absent means `false` at the detection site.
- **New query `getHasMarginSignal`** in `db/queries/charts.ts` — single SQL aggregation (group by month + parent_category), then count months with both Income and Expenses > 0. Runs in parallel with `getChartData` and `getRowCount` so no added latency. Required mocking adjustment in `dashboard.test.ts`.
- **SWR per-key mock** added to `DashboardShell.test.tsx` so break-even tests can feed `/org/financials` data without disturbing the chart-data fallback.

### Completion Notes List

- **Task 1** — `StatType.BreakEven` added to types union + `BreakEvenDetails` + `BreakEvenStat`. Discriminated union forced every downstream switch to add a branch, which is exactly the safety net we wanted.
- **Task 2** — `computeBreakEven` + `breakEvenConfidence` + `latestMonthlyRevenue` helper shipped. Six suppression cases, all return `[]`. `computeStats` edited per Task 2.7 exact pattern — cashFlowStats/runwayStats idiom extended with marginStats/currentMonthlyRevenue/breakEvenStats. `RunwayFinancials` interface gained `monthlyFixedCosts?: number`.
- **Task 3** — Three new case branches in `scoring.ts`. Inline comment documents the monotonicity invariant (Runway > Burning > BreakEven). Exact 0.8270 total asserted via `toBeCloseTo(0.8270, 4)`.
- **Task 4** — `formatStat` renders `- [Overall] Break-Even: $X/mo at Y.Y% margin — current revenue $Z/mo, gap $W (confidence: ..., relevance: ...)`. `DEFAULT_VERSION` bumped `v1.4` → `v1.5`. `v1.5.md` created by copying `v1.4.md` verbatim and appending Break-Even framing, Runway-BreakEven dedup, and Low-Confidence hedge rules. Four `'v1.4'` test assertions updated via `replace_all`.
- **Task 5** — `classifyStatNumbers` gains `case StatType.BreakEven` pushing three currency tokens (`breakEvenRevenue`, `monthlyFixedCosts`, `currentMonthlyRevenue`). `gap` intentionally omitted — covered by pairwise-sum tolerance.
- **Task 6** — `FinancialsForm.tsx` gained a `monthlyFixedCosts` input with matching currency-mask pattern + inline max-bound error + helper text. Payload idiom matches exactly: `if (parsedFixedCosts != null && parsedFixedCosts >= 0)`. Submit gated on exceeded max.
- **Task 7** — `hasMarginSignal` surfaced via new `getHasMarginSignal` query + dashboard route extension. `DashboardShell.tsx` adds `needsBreakEvenEnable` detection + `saveMonthlyFixedCosts` handler + second `LockedInsightCard` render (below runway card). `ChartData` schema extended with the optional flag.
- **Task 8** — 17 new fixtures for `computeBreakEven` + 4 for `breakEvenConfidence` + 3 integration fixtures in `computeStats` wiring. 48 → 72 tests in computation.test.ts (+24).
- **Task 9** — 5 new break-even scoring tests covering the 0.8270 exact total, the demoted band for gap <= 0, monotonicity assertion, and config tunability. 19 → 24 tests in scoring.test.ts (+5).
- **Task 10** — 2 new end-to-end fixtures in `index.test.ts`: below-break-even with row-label privacy guard, above-break-even with negative gap rendering. Hardcoded regex assertions on prompt content. 14 → 16 tests (+2).
- **Task 11** — 5 new validator cases covering exact breakEvenRevenue, exact monthlyFixedCosts, fabricated break-even, pairwise gap tolerance, marginPercent cross-coverage. 26 → 31 tests (+5).
- **Task 12** — 4 new break-even UI tests in `DashboardShell.test.tsx`: renders when condition met, hidden when `hasMarginSignal` false, hidden when `monthlyFixedCosts` set, submits `{ monthlyFixedCosts: 15000 }` as exact numeric payload. Introduced per-key SWR mock. 33 → 37 tests (+4).
- **Task 8.6** — Seed-validation snapshot regenerated. Phase 2 assertions updated to reflect actual top-N (pre-existing CI drift since Story 8.1 — fixed as in-scope cleanup).
- **Task 13** — `_bmad-output/project-context.md` updated: Financial Baseline section adds break-even computation rule, Locked Insight section adds the two-consumer reuse note + `hasMarginSignal` sourcing rule, Curation Pipeline section adds the `v1 → v1.5` prompt history chain.
- **Task 14** — `sprint-status.yaml` flipped to `review`. Story file status flipped to `review`.

### File List

**Modified:**

- `apps/api/src/services/curation/types.ts` — added `BreakEven` enum value + `BreakEvenDetails` + `BreakEvenStat` + union entry
- `apps/api/src/services/curation/computation.ts` — added `computeBreakEven`, `breakEvenConfidence`, `latestMonthlyRevenue` helper; extended `RunwayFinancials` with `monthlyFixedCosts?`; narrowed `computeMarginTrend` return to `MarginTrendStat[]`; wired into `computeStats`
- `apps/api/src/services/curation/scoring.ts` — three new case branches for `StatType.BreakEven` + inline monotonicity invariant doc
- `apps/api/src/services/curation/assembly.ts` — `case StatType.BreakEven` in `formatStat`; `DEFAULT_VERSION` `v1.4` → `v1.5`
- `apps/api/src/services/curation/validator.ts` — `case StatType.BreakEven` in `classifyStatNumbers`
- `apps/api/src/db/queries/charts.ts` — new `getHasMarginSignal` query
- `apps/api/src/routes/dashboard.ts` — route handler extended with `hasMarginSignal` in both authed and anonymous paths
- `apps/api/src/services/curation/computation.test.ts` — 24 new tests (fixtures + helper + wiring)
- `apps/api/src/services/curation/scoring.test.ts` — 5 new tests + `breakEvenStat` helper
- `apps/api/src/services/curation/assembly.test.ts` — `v1.4` → `v1.5` assertion update
- `apps/api/src/services/curation/index.test.ts` — 4 x `v1.4` → `v1.5` assertion updates + 2 new break-even end-to-end tests
- `apps/api/src/services/curation/validator.test.ts` — 5 new break-even validator tests + `breakEvenStat` helper
- `apps/api/src/routes/dashboard.test.ts` — `mockGetHasMarginSignal` wired into both `beforeEach` slots
- `apps/web/app/dashboard/TransparencyPanel.tsx` — `break_even: 'Break-Even'` added to label map
- `apps/web/app/dashboard/DashboardShell.tsx` — `needsBreakEvenEnable` + `saveMonthlyFixedCosts` + second `LockedInsightCard` render
- `apps/web/app/dashboard/DashboardShell.test.tsx` — per-key SWR mock + 4 break-even UI tests
- `apps/web/app/settings/financials/FinancialsForm.tsx` — `monthlyFixedCosts` input + mask + bound validation
- `packages/shared/src/schemas/charts.ts` — `hasMarginSignal?: boolean` added to `chartDataSchema`
- `scripts/validate-seed.ts` — phase 2 assertions updated (`category_breakdown` → `margin_trend`, categoryCount floor 5 → 4) to match current scoring output
- `scripts/__snapshots__/seed-validation.snap.json` — regenerated for `v1.5` + new statTypes composition
- `_bmad-output/project-context.md` — three sections updated per Task 13
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `8-3` → `review`
- `apps/api/src/services/curation/types.ts_explained.md` — Story 8.3 section appended
- `apps/api/src/services/curation/computation.ts_explained.md` — Story 8.3 section appended
- `apps/api/src/services/curation/scoring.ts_explained.md` — Story 8.3 section appended
- `apps/api/src/services/curation/assembly.ts_explained.md` — Story 8.3 section appended
- `apps/api/src/services/curation/validator.ts_explained.md` — Story 8.3 section appended
- `apps/web/app/dashboard/TransparencyPanel.tsx_explained.md` — Story 8.3 section appended
- `apps/web/app/dashboard/DashboardShell.tsx_explained.md` — Story 8.3 section appended

**Created:**

- `apps/api/src/services/curation/config/prompt-templates/v1.5.md` — full v1.4 template + Break-Even framing + Runway-BreakEven dedup + Low-Confidence hedge blocks
- `apps/web/app/settings/financials/FinancialsForm.tsx_explained.md` — 8-section interview doc (the file didn't have one prior to this story)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-21 | 1.0 | Initial story creation — 21 ACs, 14 tasks across curation types / computation / scoring / assembly v1.5 / validator / settings form / dashboard wiring / tests. Reuses 8.2's `LockedInsightCard`, `/settings/financials` page, and `updateOrgFinancials` JSONB merge. No new table, no new endpoint, no new component. | Claude Opus 4.7 via create-story |
| 2026-04-21 | 1.1 | Validation fixes applied (17 findings from fresh-context review). Critical: (a) `currentMonthlyRevenue` sources from a new `latestMonthlyRevenue(rows)` helper in `computeStats`, NOT from `CashFlowStat` (which suppresses for near-break-even businesses — would defeat reassuring framing for healthy orgs); (b) Task 2.7 now prescribes the exact `computeStats` edit pattern with a ready-to-paste code block mirroring the `cashFlowStats`/`runwayStats` idiom; (c) Task 6.3 matches the existing `FinancialsForm` `if (parsed != null && parsed >= 0) updates.X = ...` idiom exactly, and acknowledges the clear-value UX gap; (d) `hasMarginData` gating replaced with deterministic `hasMarginSignal` surfaced by `GET /api/dashboard/charts` — avoids the fresh-user race where a summary hasn't streamed yet; (e) cache-invalidation test count corrected to 5 `'v1.4'` occurrences with deploy-cost note. Enhancements: monotonicity comment rewritten as an intentional invariant (not a caught mistake); 2% vs 5% threshold asymmetry with CashFlow acknowledged in AC #6; "don't know" helper text added to settings form; new AC #22 + Task 8.6 for seed-validation snapshot regeneration; `undefined` vs `null` vs `NaN` test cases added to AC #19. Optimizations: integration-test assertion concretized in Task 2.8; Starting State expanded with exact file:line references; Task 14 sprint-status ownership clarified per agent. LLM-opt: AC #11 restructured as copy-paste-ready markdown block for `v1.5.md`; AC #7 confidence tiers compressed to decision table; Business Context trimmed; validator line-number references replaced with function-name references (line numbers drift across stories); commit sequence marked non-binding. Scope revised from 1.5–2 days to 2 days to account for `hasMarginSignal` API work. | Claude Opus 4.7 via story-validation |
| 2026-04-21 | 2.0 | Implementation complete — all 14 tasks shipped. Test counts: API 725 → 765 (+40), Web 412 → 416 (+4). Type-check green on both packages. Notable in-flight decisions: (a) narrowed `computeMarginTrend` return to `MarginTrendStat[]` so `computeBreakEven` consumes it without a cast — trivial safe change; (b) `RunwayFinancials` interface extended with `monthlyFixedCosts?: number` rather than introducing a new financials type; (c) `ChartData` schema gained optional `hasMarginSignal?: boolean` rather than required, so existing tests pass without fixture updates; (d) discovered pre-existing `seed-validation` drift — snapshot was stuck at `promptVersion: "v1"` and asserted `category_breakdown` in top-N, but actual top-N under current scoring is `[anomaly, margin_trend, trend]`. Pre-existing CI failure since Story 8.1. Fixed in-scope as part of Task 8.6 snapshot regeneration: updated phase 2 assertions + regenerated snapshot to v1.5. Deferred: no scope adjustments — all 22 ACs implemented. `FinancialsForm.tsx_explained.md` created fresh (prior stories never generated one; made sense to add alongside the substantial form update). | Claude Opus 4.7 (1M context) via dispatched dev subagent |
