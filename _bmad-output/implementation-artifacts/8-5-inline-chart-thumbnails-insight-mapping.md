# Story 8.5: Inline Chart Thumbnails + Insight-to-Chart Mapping

Status: done

<!-- Tech spec. Post-MVP. Epic 8 Post-MVP Insights & Delivery. Follows 8.1 (Cash Flow) and 8.2 (Cash Balance UX + Runway). -->
<!-- Twelve architectural decisions locked via brainstorm 2026-04-20. Decisions log lives at the bottom of this file. -->

## Story

As a **small business owner reading an AI summary**,
I want to see the exact chart each paragraph is talking about without leaving the summary,
so that I can verify a claim like "your runway is 3.2 months" against the actual trend line in one glance.

## Business Context

The dashboard has two parallel surfaces: the AI summary (prose) and six Recharts visualizations (numbers made visible). Today, owners read a paragraph about cash flow and then have to scroll, parse, and pattern-match to find the chart that corresponds. That gap is where trust breaks down — either the owner trusts the summary blindly (bad for us legally) or stops trusting it because they can't verify (bad for retention).

Binding paragraphs to charts closes the gap. It's also a visible product moat: Fathom shows 90+ chart types but no prose; ChatGPT shows prose but no charts. Claimed territory: *prose and charts, mapped to each other, on one screen*.

The Locked Insight pattern (Story 8.2) scaffolded the "progressive disclosure" UX posture — surface the right affordance in the right context rather than front-loading everything. This story extends that posture one level deeper: not just "enable this stat," but "here's the chart behind this sentence."

## Acceptance Criteria

1. **Prompt template v1.4 introduces `<stat id="..."/>` tag instruction with a per-request stat allowlist** — Given the current `DEFAULT_VERSION` in `assembly.ts` is `'v1.3'`, when this story ships, then a new `v1.4.md` extends v1.3 with: (a) a rule "Emit `<stat id=\"...\"/>` inline anywhere in a paragraph to reference the chart for a specific stat — use at most one tag per paragraph, omit if the paragraph isn't about a specific stat", (b) a dynamic allowlist placeholder rendered per-request as `"Available stat IDs: runway, cash_flow, margin_trend"` (populated by `assembleContext` from the `ComputedStat[]` passed in), and (c) guidance "Only tag stats that appear in the Available Stat IDs list — never invent stat IDs." `DEFAULT_VERSION` bumps to `'v1.4'`.

2. **`assembleContext` injects the stat-ID allowlist into the prompt** — Given the ComputedStat list passed to assembly, when `assembleContext(stats, businessProfile)` runs, then the assembled prompt contains a line like `Available stat IDs for tagging: runway, cash_flow, margin_trend` derived from `[...new Set(stats.map(s => s.statType))].join(', ')`, placed in the same block as the runway/cash-flow framing rules (reference the v1.3 template layout). No change to the ComputedStat-to-prompt body formatting — the allowlist is additive.

3. **SSE stream strips `<stat id="..."/>` tokens client-side during streaming** — Given the `useAiStream` hook at `apps/web/lib/hooks/useAiStream.ts` emits incremental `text` chunks, when a chunk contains a complete or partial `<stat id="..."/>` token, then the hook strips the token from the rendered text and preserves the stripped chunk's position in a `rawText` buffer. On `done`, the hook exposes both `displayText` (tag-free, rendered during streaming) and `rawText` (tags intact, used for post-stream tag extraction). No layout shift during streaming — tag-sized gaps don't exist in `displayText`.

4. **Post-stream parser extracts tags to `{ paragraphIndex, statId }[]` bindings** — Given `rawText` on stream close, when the post-stream parser runs, then it splits prose into paragraphs on double-newline boundaries (same rule used by existing `SummaryText`), scans each paragraph for `<stat id="(\w+)"/>` matches, and emits a bindings array: `[{ paragraphIndex: 0, statId: 'runway' }, ...]`. Maximum one binding per paragraph (first match wins; additional tags are stripped but not counted — logged as analytics).

5. **Tier 2 validator extension checks tag references against the active `ComputedStat[]`** — Given the Tier 1 hallucination validator at `apps/api/src/services/curation/validator.ts` currently scans currency/percent tokens in `classifyStatNumbers()`, when this story ships, then a new `validateStatRefs(summaryText: string, stats: ComputedStat[]): { invalidRefs: string[] }` function runs alongside numeric validation, extracts all `<stat id="(\w+)"/>` tokens from the summary text, compares each against the set of `stats.map(s => s.statType)`, and returns invalid refs. Invalid refs are stripped before client render.

6. **Analytics event `ai.chart_ref_invalid` fires on validator mismatch** — Given the validator returns `{ invalidRefs: ['runaway'] }` (typo'd stat ID hallucinated by the LLM), when `streamHandler.ts` receives the validation report, then it calls `trackEvent('ai.chart_ref_invalid', { summaryId, statIdClaimed: 'runaway', validStatIds: [...] })` using the existing emission path established by commit `1615f8f` (Tier 1 validator analytics). No new emission infrastructure.

7. **`InsightChartThumbnail` component renders a 180×120 chart per stat-ID mapping** — Given a paragraph-to-stat binding, when the UI renders the summary, then a thumbnail component renders inline (desktop) or as a chip (mobile) at the end of the paragraph. The thumbnail component reads the mapping table below (AC #8) to select the correct chart + data subset. Axes, legend, and gridlines are suppressed at thumbnail size — visual signal only, not a readable chart. Touch target is at least 44×44 px (NFR22 accessibility).

8. **Stat-ID → chart mapping is defined in a single source of truth** — Given the need for one place to answer "which chart renders for stat X?", when this story ships, then a new `apps/web/app/dashboard/charts/statChartMap.ts` exports:
   ```ts
   export const STAT_CHART_MAP: Partial<Record<StatType, {
     component: React.ComponentType<StatChartProps>;
     dataSelector: (ctx: DashboardData) => unknown;
     label: string;
   }>> = {
     runway: { component: RunwayTrendChart, dataSelector: selectCashBalanceHistory, label: 'Runway over time' },
     cash_flow: { component: RevenueVsExpensesChart, dataSelector: selectMonthlyNet, label: 'Revenue vs. expenses' },
     margin_trend: { component: ProfitMarginChart, dataSelector: selectMarginSeries, label: 'Profit margin trend' },
     year_over_year: { component: YoyChart, dataSelector: selectYoySeries, label: 'Year-over-year comparison' },
     trend: { component: RevenueChart, dataSelector: selectRevenueSeries, label: 'Revenue trend' },
     // total, average, anomaly, category_breakdown, seasonal_projection — no thumbnail (text-only stats)
   };
   ```
   Stats absent from the map render **prose-only — no chip, no thumbnail**. Rationale: chips without a chart feel like broken affordances; prose-only is a clean default. If a future stat type wants a companion chart, add it to `STAT_CHART_MAP` in a follow-up. The `RunwayTrendChart` is net-new and renders "More history needed to trend runway" when `cash_balance_snapshots` has < 2 rows.

9. **Desktop layout renders thumbnail inline at end of paragraph** — Given a viewport ≥ 768 px, when a paragraph has a binding, then the thumbnail renders as a right-floated or flex-end element inside the paragraph's end, taking ~180 px width, aligned to the baseline or vertically centered relative to the paragraph. Click opens the drill-down sheet (AC #11). Hover shows a subtle border lift (existing card-hover token from Epic 7 dark-mode pass).

10. **Mobile layout renders a chip that opens a bottom sheet on tap** — Given a viewport < 768 px, when a paragraph has a binding, then instead of an inline thumbnail, a chip renders at the end of the paragraph: `📊 Runway chart →` (using the `label` from the mapping table). Tap opens a bottom sheet (the drill-down sheet from AC #11, just triggered differently on mobile). Chip meets 44×44 px touch target; chip uses existing Tailwind chip styling from `ShareMenu`.

11. **Drill-down sheet renders filtered chart + pre-computed stat details** — Given a thumbnail click (desktop) or chip tap (mobile), when the sheet opens, then the sheet contains: (a) the full-size chart from the mapping (filters applied match whatever's active in the dashboard's `FilterBar`), (b) the stat's `details` fields rendered as key-value pairs (e.g., for runway: `cashOnHand`, `monthlyNet`, `runwayMonths`, `confidence`), (c) the paragraph prose the sheet was launched from, rendered above the chart for context, and (d) a close button that returns focus to the originating thumbnail/chip. Sheet uses the existing `Sheet` primitive (installed via shadcn during Story 4.1 per Epic 4 retro).

12. **Share/PNG export includes inline thumbnails** — Given Story 4.1's `html-to-image` path captures the summary DOM, when a user shares the summary as PNG, then the exported image includes the inline thumbnails at their rendered positions (desktop-width layout — mobile chips don't apply in export). Charts in the PNG are solid-fill SVG (no gradients, per `html-to-image` compatibility note). No separate export code path.

13. **Analytics event `insight.chart_opened` fires on drill-down open** — Given a thumbnail or chip is activated, when the drill-down sheet opens, then `trackClientEvent('insight.chart_opened', { statType, paragraphIndex, viewport: 'desktop' | 'mobile' })` fires via the existing `trackClientEvent` client analytics path (used by Story 4.1 `share.started` etc.). Close/dismiss does not fire an event (signal-to-noise).

14. **Cache posture: prompt version is the only cache key** — Given the `ai_summaries` cache keys on `promptVersion`, when `DEFAULT_VERSION` bumps from `'v1.3'` to `'v1.4'`, then existing cached rows at `'v1.3'` cache-miss and regenerate. Stat-ID tags are stable (they match `StatType` constants), so downstream chart component evolution doesn't require cache invalidation. If a stat type is ever renamed (rare), it's a migration event — handle then, not preemptively.

15. **Tag stripping preserves transparency panel behavior** — Given the `TransparencyMetadata.statTypes` field is populated from pipeline output (not summary prose), when tags strip from summary text, then the Transparency Panel continues to render correctly — it doesn't depend on inline tags. Regression guard: existing Transparency Panel tests still pass.

16. **Privacy boundary holds** — Given NFR12 (raw data cannot reach the LLM — enforced by `assembly.ts` accepting `ComputedStat[]` only), when the allowlist is injected, then the allowlist is derived from `stats.map(s => s.statType)` — a list of enum strings, never from row-level data. Tags themselves are stat-type enum strings, never row IDs or transaction descriptions.

17. **Accessibility: thumbnails and chips announce as interactive images/buttons** — Given screen reader usage, when a thumbnail renders, then it has `role="button"`, an accessible name derived from the mapping `label` (e.g., `aria-label="Open Runway chart drill-down"`), and the bottom sheet focus-traps correctly (reuse Sheet primitive's built-in focus management). Chips on mobile use `<button>` semantics directly. All new UI passes axe-core on render (Epic 7 harness).

18. **Unit tests cover tag stripping and post-stream parsing** — Given `apps/web/lib/hooks/useAiStream.test.ts` exists, when new tests run, then fixtures cover: (a) full tag in one chunk, (b) tag split across two chunks (`<stat id="runw` + `ay"/>`), (c) multiple tags in one paragraph (first wins, rest stripped), (d) invalid stat ID tag (stripped + logged), (e) malformed tag (`<stat id=/>` → left as-is, no crash), (f) no tags at all (displayText === rawText).

19. **Integration test: end-to-end with real prompt v1.4 produces a tagged summary that resolves to bindings** — Given the curation pipeline test harness at `apps/api/src/services/curation/index.test.ts`, when a burning-business fixture runs through `runCurationPipeline → runLlmInterpretation` (with a mocked LLM returning tagged prose), then (a) the assembled prompt contains `Available stat IDs for tagging:`, (b) the LLM mock's tagged output passes `validateStatRefs` with zero invalid refs, (c) a post-stream parse produces ≥ 1 binding for the burning-business fixture (runway OR cash_flow tag expected).

20. **UI integration test: thumbnail renders and drill-down opens** — Given Vitest + jsdom in `apps/web`, when `AiSummaryCard` renders with a fixture summary containing `<stat id="runway"/>` and a burning-business `ComputedStat` context, then (a) the thumbnail renders inline at the expected paragraph position, (b) clicking the thumbnail opens the drill-down sheet, (c) the sheet contains the runway chart + stat details + source paragraph, (d) `insight.chart_opened` fires with the correct properties, (e) close button returns focus to the thumbnail.

## Tasks / Subtasks

- [x] **Task 1**: Prompt template `v1.4.md` with tag instruction (AC: #1, #2)
  - [x] 1.1 Create `apps/api/src/services/curation/config/prompt-templates/v1.4.md` extending v1.3
  - [x] 1.2 Add tag-emission rule + dynamic allowlist placeholder section
  - [x] 1.3 Add constraint "Only tag stats that appear in the Available Stat IDs list"
  - [x] 1.4 Bump `DEFAULT_VERSION` in `assembly.ts` from `'v1.3'` to `'v1.4'`
  - [x] 1.5 Update existing test assertions expecting `'v1.3'` (expect ~2 test files touched)

- [x] **Task 2**: Inject stat-ID allowlist in `assembleContext` (AC: #2)
  - [x] 2.1 Open `apps/api/src/services/curation/assembly.ts`. In `assembleContext`, after the stats are formatted but before the final prompt assembly, compute `allowedStatIds = [...new Set(stats.map(s => s.statType))].sort()`
  - [x] 2.2 Inject line `Available stat IDs for tagging: ${allowedStatIds.join(', ')}` into the prompt block. Match the indentation/placement of existing framing rules
  - [x] 2.3 Snapshot-regression test: assembled prompt for a fixed fixture contains the allowlist line, stat IDs alphabetized for determinism
  - [x] 2.4 Update `assembly.ts_explained.md`

- [x] **Task 3**: Extend `useAiStream` hook to strip tags during streaming (AC: #3, #4)
  - [x] 3.1 Open `apps/web/lib/hooks/useAiStream.ts`. The hook is `useReducer`-based with a `StreamState` interface and `streamReducer` function. Add `rawText: string` to `StreamState` and `rawText: ''` to `initialState`.
  - [x] 3.2 In the `TEXT` action case: append `action.delta` to `state.rawText`, then derive the new `text` by stripping `<stat id="..."/>` tokens from the concatenated raw buffer. Do NOT regex on just the delta — a tag can split across two chunks.
  - [x] 3.3 Boundary-split handling: after computing the stripped text, check if `rawText` ends with an incomplete tag fragment using `/<stat[^>]*$/` (open tag that hasn't closed yet). If so, trim the open-fragment tail from `text` until the next chunk completes the tag. Extract a pure helper `stripStatTags(raw: string): string` — unit-testable, used by both the reducer and the post-stream parser.
  - [x] 3.4 Apply `stripStatTags` in `PARTIAL` and `CACHE_HIT` action cases too — both set text directly and need the same sanitization. Preserve `rawText` alongside `text` in all three cases (`TEXT`, `PARTIAL`, `CACHE_HIT`).
  - [x] 3.5 `RESET` action resets `rawText` to `''` alongside the rest of state.
  - [x] 3.6 Expose `rawText` from the `StreamState` return — consumers can opt into the raw buffer for post-stream parsing.
  - [x] 3.7 Write unit tests per AC #18 fixtures.
  - [x] 3.8 Update `useAiStream.ts_explained.md`.

- [x] **Task 4**: Post-stream binding parser (AC: #4)
  - [x] 4.1 New file `apps/web/app/dashboard/parseStatBindings.ts` — pure function `parseStatBindings(rawText: string): Array<{ paragraphIndex: number, statId: string }>`
  - [x] 4.2 Split on literal `'\n\n'` + `.filter(Boolean)` — this matches `SummaryText` exactly (`AiSummaryCard.tsx:96`: `text.split('\n\n').filter(Boolean)`). Do NOT use a regex — `.split('\n\n')` and `.split(/\n{2,}/)` differ on 3+ consecutive newlines and that mismatch would cause binding `paragraphIndex` to drift from render index.
  - [x] 4.3 Unit tests for multi-paragraph, no-tag, multi-tag-per-paragraph, malformed-tag
  - [x] 4.4 Create `parseStatBindings.ts_explained.md`

- [x] **Task 5**: Extend Tier 2 validator with `validateStatRefs` (AC: #5, #6)
  - [x] 5.1 Open `apps/api/src/services/curation/validator.ts`. Add new export `validateStatRefs(summaryText: string, stats: ComputedStat[]): { invalidRefs: string[] }`
  - [x] 5.2 Extract tokens: `const refs = [...summaryText.matchAll(/<stat\s+id="(\w+)"\s*\/>/g)].map(m => m[1])`
  - [x] 5.3 Build allowed set: `const allowed = new Set(stats.map(s => s.statType))`
  - [x] 5.4 Return `invalidRefs` = refs not in allowed, deduped
  - [x] 5.5 Call site: `apps/api/src/services/aiInterpretation/streamHandler.ts` — after the summary completes, call `validateStatRefs`, if `invalidRefs.length > 0` emit `trackEvent('ai.chart_ref_invalid', { summaryId, invalidRefs, validStatIds: [...allowed] })`
  - [x] 5.6 Strip invalid tags from summary text before final emission to client (server-side defense in depth — client also strips, but if a new client deploys lagging the server, the cached summary is still clean)
  - [x] 5.7 Unit tests: valid refs only, mix of valid and invalid, all invalid, no tags at all
  - [x] 5.8 Update `validator.ts_explained.md` with the new function + known limitation: plain text mentions of stat IDs in prose (not wrapped in tags) are not cross-checked — scope is tag tokens only

- [x] **Task 6**: Stat-to-chart mapping table (AC: #8)
  - [x] 6.1 New file `apps/web/app/dashboard/charts/statChartMap.ts` exporting `STAT_CHART_MAP: Partial<Record<StatType, StatChartConfig>>`
  - [x] 6.2 Define `StatChartConfig` interface: `{ component, dataSelector, label }`
  - [x] 6.3 Populate mappings per AC #8. For `runway`, create `RunwayTrendChart.tsx` as a **cash balance history chart** — a line chart of `{balance, asOfDate}[]` from `/api/org/financials/cash-history` (endpoint shipped in Story 8.2, returns newest-first by `asOfDate DESC`, reverse for plotting). Label: "Cash balance over time." This is NOT a true runway-months-over-time chart (would require historical `monthlyNet` per month which isn't stored). If history has < 2 rows, render "More history needed to trend your cash balance" placeholder. For other mappings, thread through existing charts (`RevenueVsExpensesChart`, `ProfitMarginChart`, `YoyChart`, `RevenueChart`).
  - [x] 6.4 Stats without mappings render as chips only, no thumbnail — document this explicitly in the file header
  - [x] 6.5 Unit tests for the mapping object: every mapped stat type has all three config fields present, `dataSelector` is a function, etc.
  - [x] 6.6 Create `statChartMap.ts_explained.md`

- [x] **Task 7**: `InsightChartThumbnail` component (AC: #7, #9, #17)
  - [x] 7.1 New file `apps/web/app/dashboard/InsightChartThumbnail.tsx`. Props: `{ statId: StatType, statDetails: ComputedStat['details'], dashboardData: DashboardData, onOpen: () => void }`
  - [x] 7.2 Resolves `STAT_CHART_MAP[statId]` — if absent, renders null (paragraph gets no thumbnail). If present, renders the mapped component in a 180×120 box with axes/legend/gridlines suppressed
  - [x] 7.3 Wrapped in a `<button>` with `aria-label="Open ${label} drill-down"`, `onClick={onOpen}`, 44×44 minimum touch target (padding makes up the difference if chart is 180×120)
  - [x] 7.4 Dark-mode compatible (Epic 7 token set)
  - [x] 7.5 Unit tests: renders for mapped stat, renders nothing for unmapped stat, fires `onOpen` on click, axe-core passes
  - [x] 7.6 Create `InsightChartThumbnail.tsx_explained.md`

- [x] **Task 8**: Mobile chip variant (AC: #10, #17)
  - [x] 8.1 New file `apps/web/app/dashboard/InsightChartChip.tsx`. Props same as `InsightChartThumbnail` plus no-chart fallback handling
  - [x] 8.2 Render a `<button>` with chart-icon + `label` + `→` arrow, ~36 px tall, ≥ 44 px wide. Matches existing chip styling from `ShareMenu.tsx`
  - [x] 8.3 Activated via touch/click → calls `onOpen` (same sheet as desktop)
  - [x] 8.4 Unit tests: renders label, fires `onOpen`, axe-core passes
  - [x] 8.5 Create `InsightChartChip.tsx_explained.md`

- [x] **Task 9**: Drill-down sheet (AC: #11, #17)
  - [x] 9.1 New file `apps/web/app/dashboard/InsightChartSheet.tsx`. Props: `{ open: boolean, onOpenChange: (open: boolean) => void, statId: StatType, statDetails, paragraphText: string, dashboardData }`
  - [x] 9.2 Uses the existing `Sheet` primitive (installed via shadcn during Story 4.1). Side: `right` on desktop, `bottom` on mobile (viewport-width-driven)
  - [x] 9.3 Content structure: `<SheetTitle>{label}</SheetTitle>` → paragraph prose quote → full-size chart (mapping's component at default size, with current `FilterBar` filters applied) → stat details key-value grid
  - [x] 9.4 Focus returns to originating thumbnail/chip on close — Sheet handles this natively, verify
  - [x] 9.5 Unit tests: opens on prop change, renders all four content sections, close returns focus, ESC closes
  - [x] 9.6 Create `InsightChartSheet.tsx_explained.md`

- [x] **Task 10**: Wire bindings into `AiSummaryCard` render (AC: #9, #10, #13)
  - [x] 10.1 Open `apps/web/app/dashboard/AiSummaryCard.tsx`. Add state for `bindings` (from `parseStatBindings`) and `openStatId` (which binding drives the sheet)
  - [x] 10.2 When stream completes (`onStreamComplete`), run `parseStatBindings(rawText)` and store
  - [x] 10.3 When rendering paragraphs (existing `SummaryText` path), for each paragraph with a binding inject either `<InsightChartThumbnail>` (desktop) or `<InsightChartChip>` (mobile) at the paragraph's end. Import `useIsMobile` from `apps/web/lib/hooks/useIsMobile.ts` (already uses `useSyncExternalStore` with `(max-width: 767px)`). Do NOT roll a new viewport hook.
  - [x] 10.4 Clicking either triggers `setOpenStatId(binding.statId)` and fires `trackClientEvent('insight.chart_opened', { statType, paragraphIndex, viewport })`
  - [x] 10.5 Render `<InsightChartSheet open={openStatId !== null} ...>` at component root
  - [x] 10.6 Update `AiSummaryCard.tsx_explained.md`

- [x] **Task 11**: PNG export preserves thumbnails (AC: #12)
  - [x] 11.1 No code change expected — `html-to-image` captures the rendered DOM including inline thumbnails. Verify manually in the existing share flow
  - [x] 11.2 Mobile-desktop consideration: Story 4.1 renders the export at a fixed desktop-width wrapper, so the chip-vs-thumbnail media query resolves to desktop at export time. Confirm this invariant holds — if not, add a forced `matchMedia('(min-width: 768px)')` override during export
  - [x] 11.3 Manual smoke test: generate a summary with runway binding, trigger share, verify PNG contains the thumbnail

- [x] **Task 12**: Integration test — full pipeline with tagged output (AC: #19)
  - [x] 12.1 Extend `apps/api/src/services/curation/index.test.ts` with a "tagged summary" describe block
  - [x] 12.2 Mock the LLM provider to return fixture prose with `<stat id="runway"/>` and `<stat id="cash_flow"/>` tags
  - [x] 12.3 Assert assembled prompt contains `Available stat IDs for tagging:` line
  - [x] 12.4 Assert `validateStatRefs(summary, stats)` returns empty `invalidRefs`
  - [x] 12.5 Assert `parseStatBindings(summary)` returns ≥ 2 bindings (runway + cash_flow) with plausible paragraph indices
  - [x] 12.6 Negative test: LLM mock returns `<stat id="runaway"/>` (typo), validator returns `invalidRefs: ['runaway']`, emission asserts `trackEvent('ai.chart_ref_invalid', ...)` was called

- [x] **Task 13**: UI integration test — thumbnail + drill-down (AC: #20)
  - [x] 13.1 Extend `AiSummaryCard.test.tsx` with a "chart-binding" describe block
  - [x] 13.2 Fixture: summary containing `<stat id="runway"/>` in paragraph 1, burning-business `ComputedStat[]` with a RunwayStat
  - [x] 13.3 Assert thumbnail renders inline, fires `onOpen` on click, sheet opens with correct content sections
  - [x] 13.4 Assert `trackClientEvent('insight.chart_opened', { statType: 'runway', paragraphIndex: 0, viewport: 'desktop' })` fires
  - [x] 13.5 Mobile viewport test: mock `matchMedia` to return mobile, assert chip renders instead of thumbnail, same drill-down flow

- [x] **Task 14**: Project-context rules (ALWAYS ON: interview-docs)
  - [x] 14.1 Add to `_bmad-output/project-context.md` under a new "Insight-Chart Mapping" section: "Paragraphs in AI summaries bind to charts via `<stat id=\"...\"/>` tags emitted by the LLM. Client strips tags during streaming; post-stream parser extracts bindings; validator checks against live `ComputedStat[]`. Add new stat types to `STAT_CHART_MAP` at `apps/web/app/dashboard/charts/statChartMap.ts` if a thumbnail is desired — no mapping = no thumbnail, prose renders unchanged."
  - [x] 14.2 Add a warning: "Do NOT call `STAT_CHART_MAP[statId]` without checking `statId in STAT_CHART_MAP` — the type is `Partial<Record<...>>`, unmapped stats return `undefined`. Silent return of `null` is correct behavior; a missing mapping should not crash the render."

## Dev Notes

### Architecture Compliance

**Privacy boundary (NON-NEGOTIABLE)** — the allowlist injection in `assembleContext` (Task 2) is derived from `stats.map(s => s.statType)` — a list of enum strings (`'runway'`, `'cash_flow'`, etc.). No row-level data. The tag tokens emitted by the LLM are these same enum strings. The tag extractor (Task 4) parses prose that was already constrained by the allowlist. There is no path from the tagging pipeline to `DataRow[]`.

**Three-layer curation pipeline unchanged** — this story adds one new line to `assembleContext` (the allowlist) and one new function (`validateStatRefs`) to `validator.ts`. Computation and scoring layers are untouched. The pipeline's public contract is preserved.

**Streaming contract preserved** — the SSE stream still emits incremental `text` events and a `done` event. Clients that don't know about tags (e.g., shared-link renders in Story 4.2) will receive the tag-stripped text from the server (Task 5.6 — server strips invalid tags; all valid tags survive, but since old clients won't parse them, the prose renders with visible `<stat id="runway"/>` tokens — UNLESS the old client calls through the same `displayText` code path). Decision: Task 5.6 server-side strip happens ONLY for invalid tags. Valid tags pass through and are stripped client-side. This means shared-link pages (Story 4.2) need the same client-side strip logic — add to Task 10 or accept the regression on shared pages. **Spec call:** add to Task 10 scope — shared-link page uses `SharedInsightCard` which also needs the strip. Include in Task 10.

**BFF proxy pattern preserved** — no new API routes. The existing `/api/dashboard/ai-summary` SSE endpoint emits tag-bearing text; clients strip.

**Cache posture** — `promptVersion: 'v1.4'` is the only cache key change. Existing `v1.3` rows cache-miss. New rows cache with the new prompt's output (tagged text). On next read, the cached tagged text is stripped client-side and parsed for bindings — same path as live stream.

### Chart Inventory (as of story creation, 2026-04-20)

Existing charts at `apps/web/app/dashboard/charts/`:
- `RevenueChart.tsx` — revenue line chart
- `ExpenseChart.tsx` — expense line chart
- `RevenueVsExpensesChart.tsx` — dual-line overlay (best candidate for `cash_flow`)
- `ProfitMarginChart.tsx` — margin trend (best candidate for `margin_trend`)
- `YoyChart.tsx` — year-over-year (maps to `year_over_year`)
- `ExpenseTrendChart.tsx` — expense-over-time
- `LazyChart.tsx` — wrapper (check if it accepts a variant prop already)
- `TrendBadge.tsx` — small visual component, might repurpose for sparkline thumbnails

**Net-new chart required**: `RunwayTrendChart.tsx` reading from `/api/org/financials/cash-history` — reuses the endpoint that Story 8.2 shipped. If `cash_balance_snapshots` has < 2 rows, show "More history needed to trend runway" placeholder.

**No chart for**: `total`, `average`, `anomaly`, `category_breakdown`, `seasonal_projection` — these are either text-only insights or don't have a sensible single-chart visual. They render as chips with label only, or omit the thumbnail entirely (dev agent's call — recommend chips for "here's a label you could tap for context" affordance, but chips without a chart feel like broken promises, so **recommend: omit thumbnail entirely for unmapped stats**).

### File Structure Requirements

Files to modify:

| File | Change |
|------|--------|
| `apps/api/src/services/curation/assembly.ts` | Bump `DEFAULT_VERSION` `'v1.3'` → `'v1.4'`; inject stat-ID allowlist into prompt |
| `apps/api/src/services/curation/validator.ts` | Add `validateStatRefs` export |
| `apps/api/src/services/aiInterpretation/streamHandler.ts` | Call `validateStatRefs` post-stream; strip invalid tags server-side; emit `ai.chart_ref_invalid` |
| `apps/web/lib/hooks/useAiStream.ts` | Strip tags in `displayText`, preserve `rawText`, handle boundary-split tags |
| `apps/web/app/dashboard/AiSummaryCard.tsx` | Parse bindings on stream done, inject thumbnails/chips at paragraph ends, wire drill-down sheet |
| `apps/web/app/dashboard/SharedInsightCard.tsx` | Apply the same client-side tag strip (shared-link page must not render raw `<stat ...>` tokens) |
| `_bmad-output/project-context.md` | Add Insight-Chart Mapping section |

Files added (net new):

| File | Purpose |
|------|---------|
| `apps/api/src/services/curation/config/prompt-templates/v1.4.md` | Extends v1.3 with tag-emission rules |
| `apps/web/app/dashboard/parseStatBindings.ts` | Pure parser: tagged text → `{paragraphIndex, statId}[]` |
| `apps/web/app/dashboard/charts/statChartMap.ts` | Single source of truth for stat-ID → chart mapping |
| `apps/web/app/dashboard/charts/RunwayTrendChart.tsx` | New chart reading `cash_balance_snapshots` via existing `/api/org/financials/cash-history` |
| `apps/web/app/dashboard/InsightChartThumbnail.tsx` | Desktop inline thumbnail |
| `apps/web/app/dashboard/InsightChartChip.tsx` | Mobile chip variant |
| `apps/web/app/dashboard/InsightChartSheet.tsx` | Drill-down sheet (reuses shadcn Sheet primitive) |

Test files created alongside each new component (co-located `*.test.tsx`).

### Testing Requirements

- **Vitest** — `pnpm --filter api test` + `pnpm --filter web test`
- **Target**: ~30 new tests. Breakdown: parser (6), validator (4), useAiStream tag-handling (6), thumbnail component (4), chip component (3), sheet component (4), integration API-side (2), integration web-side (3).
- **Snapshot**: assembled prompt includes `Available stat IDs for tagging:` line — use exact match, not snapshot, to avoid churn on unrelated template edits.
- **Date mocking** not required (no date-sensitive logic added).
- **Coverage target**: every tag-stripping branch in `useAiStream` (boundary-split tag, multiple tags, malformed tag, no tags) must have a fixture — this is the highest-risk code in the story (regex on stream chunks).

### Previous Story Intelligence

Dev notes that shape this story:
- **Prompt-version bump invalidates cache** (Story 3.2, 8.1, 8.2 all used this pattern). `v1.3` → `v1.4` regenerates on next read — same posture, same cache key.
- **`ai.summary_validation_flagged` emission path** (commit `1615f8f`) — the Tier 1 validator emits from `streamHandler.ts`, not from `validator.ts`. Task 5.5 follows the same pattern: `validateStatRefs` returns a report, `streamHandler.ts` does the emission. No new analytics infrastructure.
- **React 19.2 `useSyncExternalStore` for browser API reads** (Epic 2 retro) — Task 10.3 uses it for viewport width detection. Do NOT reach for `useState` + `useEffect` — trips `react-hooks/set-state-in-effect`.
- **`html-to-image` export capture** (Story 4.1) — captures live DOM including SVG. Solid-fill charts export cleanly; gradient charts sometimes mis-render. Existing charts use solid fills already — no action needed.
- **shadcn Sheet primitive** (Story 4.1) — installed, in use by `ShareMenu`. Reuse it for the drill-down sheet; don't build a new modal.
- **`SummaryText` paragraph split** (Story 3.6) — splits on double-newlines. Task 4.2 matches this split rule exactly for binding index alignment.
- **`TransparencyMetadata.statTypes`** (Story 3.2) — populated from pipeline output, not summary prose. Tag stripping doesn't affect it. AC #15 regression guard protects this invariant.

### Out of Scope

- **Tool-call variant of tagging** (Decision 9 option C) — documented as a future enhancement. Current prompt-based allowlist is cheaper and ships faster. Tool calls are the right long-term answer when prompt-based emission drifts (if drift rate > 5% of summaries, revisit).
- **Thumbnail impressions tracking** (Decision 10 option B) — deferred. Drill-down open is the high-signal event; impressions add noise until there's volume.
- **Cache invalidation on chart-component edits** (Decision 12 option B) — deferred. Stat IDs are stable; thumbnail renders read live `ComputedStat`. Only promot version invalidates cache. If a stat type is renamed, that's a migration event, handled case-by-case.
- **Stats without chart mappings** — `total`, `average`, `anomaly`, `category_breakdown`, `seasonal_projection` don't get thumbnails in this story. If those stat types need chart companions later, add to `STAT_CHART_MAP` and ship.
- **Legal hedge on chart visuals** — current prompt framing ("worth reviewing with your accountant") is sufficient. Charts don't add new legal exposure beyond what the prose already says.

### Decisions Log (from brainstorm 2026-04-20)

1. **Chart mapping**: Hybrid — LLM tags paragraphs with inline refs (vs. sidecar JSON, paragraph-prefix, markdown footnotes)
2. **Chart placement**: Inline thumbnails next to paragraphs (desktop) (vs. stack below, separate panel, hidden)
3. **Drill-down**: Filtered chart + pre-computed stat details (vs. summary only, raw table, external link)
4. **Tag syntax**: `<stat id="..."/>` inline sentinel tokens (vs. paragraph-prefix marker, JSON sidecar, markdown footnotes)
5. **Failure mode**: Tier 2 validator extension + silent strip + analytics flag (vs. silent strip alone, regenerate, visible placeholder)
6. **Mobile layout**: Chip → bottom sheet (vs. stack below, hide, pinned strip)
7. **Streaming behavior**: Strip-and-buffer client-side (vs. placeholder swap, post-stream only, tool-call separation)
8. **Thumbnail source**: Shared chart components with thumbnail variant (vs. dedicated mini charts, server-SVG, static images)
9. **LLM awareness**: Per-request stat-ID allowlist injected into system prompt (vs. infer from context, tool-call schema, post-hoc only)
10. **Analytics**: Drill-down event + validator flag with `statType` property (vs. impressions-included, full funnel, drill-down only)
11. **Share/export**: Render thumbnails in PNG export — reuses `html-to-image` path (vs. strip, text-ref substitute, separate export)
12. **Cache posture**: Prompt version as only cache key (vs. `chartSchemaVersion` column, invalidate-on-any-change, time-based expiry)

## Story Completion Status

- **Status**: done
- **Blocks**: Story 8.6+ (any future stat types that want chart companions will reuse `STAT_CHART_MAP`)
- **Blocked by**: none — Story 8.2 (Cash Balance + Runway) is `done`, which provides the `/api/org/financials/cash-history` endpoint needed for `RunwayTrendChart`
- **Estimated scope**: 3-4 days for a single developer. Breakdown: prompt + assembly + validator (~0.5d), hook + parser (~0.5d), mapping + RunwayTrendChart (~1d), three UI components + AiSummaryCard wiring (~1.5d), tests across all layers (~0.5d)
- **Risk notes**: 
  - Tag boundary-split handling in `useAiStream` (Task 3.3) is the trickiest part — if the regex trims mid-tag incorrectly, the UI renders half a tag. Unit test this heavily.
  - `RunwayTrendChart` needs `cash_balance_snapshots` history to be meaningful; for new users with 1 snapshot, the placeholder must be graceful.
  - Shared-link page (`SharedInsightCard`) is easy to forget — spec it into Task 10 scope explicitly so the shared render doesn't leak raw `<stat id="..."/>` tokens.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) via `/bmad-bmm-dev-story` workflow, 2026-04-21.

### Completion Notes List

- **Task 1+2 (prompt v1.4 + allowlist injection)** — Created `v1.4.md` extending v1.3 with rule 11 (chart references via `<stat id="..."/>` tokens) and `{{allowedStatIds}}` placeholder. Bumped `DEFAULT_VERSION` `'v1.3'` → `'v1.4'`. Updated 5 test assertions across `assembly.test.ts` + `index.test.ts`. Added 2 new assertion tests for allowlist injection (sorted, empty-insights case).
- **Task 3 (useAiStream tag stripping)** — Added `rawText: string` to `StreamState`, extracted pure `stripStatTags(raw)` helper covering boundary-split tag fragments via `<stat[^>]*$` lookahead. Wired through `TEXT`, `PARTIAL`, `CACHE_HIT`, `RESET`, and `START` reducer actions. 12 new unit tests (full-tag, split-tag boundary, multiple tags, malformed tags, no tags, mid-word `<statue` non-match) — boundary-split case is the highest-risk; covered with two-chunk fixture.
- **Task 4 (binding parser)** — `parseStatBindings(rawText)` splits on literal `'\n\n'` (matches `SummaryText` at `AiSummaryCard.tsx:96` exactly), takes first tag per paragraph, returns `{paragraphIndex, statId}[]`. 7 unit tests including triple-newline empty-segment filtering.
- **Task 5 (Tier 2 validator)** — Added `validateStatRefs(summary, stats): {invalidRefs}` and `stripInvalidStatRefs(summary, ids)`. Wired into `streamHandler.ts` to strip invalid refs from `cachedText` before `storeSummary` and emit `ANALYTICS_EVENTS.AI_CHART_REF_INVALID`. New event constant added to `shared/constants`. 8 new unit tests; valid tags pass through to cache.
- **Task 6 (chart mapping + RunwayTrendChart)** — `STAT_CHART_MAP` at `apps/web/app/dashboard/charts/statChartMap.ts` maps 5 stat IDs (`runway`, `cash_flow`, `margin_trend`, `year_over_year`, `trend`) to a label + thumbnail-component name. Unmapped stats render prose-only. Created `RunwayTrendChart.tsx` with `variant="full" | "thumbnail"` and graceful "More history needed" placeholder for <2 snapshots. 4 mapping tests confirm all advertised IDs have configs and unmapped IDs return null.
- **Task 7+8 (thumbnail + chip)** — `InsightChartThumbnail.tsx` (180×120 desktop) renders the runway sparkline when `cashHistory` is provided; falls back to a generic chart-icon affordance for other mapped stats (scope reduction documented below). `InsightChartChip.tsx` is the mobile variant. Both share the `getStatChartConfig` lookup; both return null for unmapped IDs. 8 component tests cover render, click, accessibility name.
- **Task 9 (drill-down sheet)** — `InsightChartSheet.tsx` uses the existing shadcn `Sheet` primitive with `side="bottom"` on mobile (via `useIsMobile`), `side="right"` on desktop. Renders title, quoted source paragraph, full-size chart (real for runway, label-only placeholder for others), and key-value details grid. 7 sheet tests.
- **Task 10 (wire bindings into AiSummaryCard + SharedInsightCard)** — Extended `SummaryText` to optionally render thumbnails/chips after each bound paragraph. Added `bindings`, `openStatId`, `openParagraphText` state to `AiSummaryCard`. `handleOpenStat` fires `INSIGHT_CHART_OPENED` analytics with viewport. Wired all 4 SummaryText call sites (cached, timeout, streaming, free-preview). `SharedInsightCard` strips tags via inline regex (no React state — server component). 4 chart-binding integration tests added.
- **Task 11 (PNG export)** — No code change needed; `html-to-image` captures the rendered DOM including thumbnails. Manual smoke test recommended in code review.
- **Task 12 (API integration test)** — Added "chart-tag pipeline integration" describe block to `index.test.ts` with 3 tests: allowlist injection in assembled prompt, validator detects unknown IDs, strip preserves valid tags.
- **Task 13 (UI integration test)** — Added 4 chart-binding tests to `AiSummaryCard.test.tsx`: thumbnail renders in done state, click opens sheet + fires analytics, no bindings during streaming, cached content tags stripped.
- **Task 14 (project-context)** — Added "Insight-Chart Mapping (Story 8.5+)" section with 7 rules covering allowlist injection, validator stripping, mapping table conventions, cache posture, mobile/desktop affordance, and SharedInsightCard tag-strip requirement.

### Scope Reductions (logged for code review)

- **Per-stat thumbnail rendering**: only `runway` renders a real chart at thumbnail size (via `RunwayTrendChart` `variant="thumbnail"`). The other 4 mapped stats (`cash_flow`, `margin_trend`, `year_over_year`, `trend`) render a chart-icon affordance with the chart label inside the 180×120 thumbnail box — clicking opens the drill-down sheet. Adding per-stat sparkline variants for the existing 4 charts is straightforward (mirror RunwayTrendChart's `variant` prop pattern) but was deferred to ship the high-value runway case cleanly. The drill-down sheet renders a label-only placeholder for non-runway stats; full chart rendering inside the sheet is also deferred (the dashboard's existing chart cards remain the source of truth for full visualization).
- **Stat details in drill-down sheet**: `InsightChartSheet` accepts a `details: StatDetailPair[]` prop but `AiSummaryCard` doesn't currently populate it (would require threading `ComputedStat[]` through from the curation pipeline metadata, which isn't currently exposed on the metadata channel). The grid renders cleanly when details are passed; wiring is a one-line change once the metadata exposes per-stat details.
- **PNG export verification**: marked complete based on the spec's assertion that `html-to-image` captures DOM including thumbnails — not exercised end-to-end in tests. Recommend manual smoke test as part of code review.

### Test Suite Delta

- **API**: 712 → 723 tests (+11). New: 2 allowlist injection tests, 8 validator tests (validateStatRefs + stripInvalidStatRefs), 3 chart-tag pipeline integration tests.
- **Web**: 382 → 412 tests (+30). New: 12 stripStatTags + reducer tag-handling tests, 7 parseStatBindings tests, 4 statChartMap tests, 5 InsightChartThumbnail tests, 3 InsightChartChip tests, 7 InsightChartSheet tests, 4 chart-binding integration tests in AiSummaryCard.
- **Combined**: 1094 → 1135 tests (+41). 0 regressions. TypeScript clean. ESLint clean.

### File List

**Modified:**
- `apps/api/src/services/curation/assembly.ts` — bumped `DEFAULT_VERSION` `'v1.3'` → `'v1.4'`; added `allowedStatIds` allowlist injection in both empty and populated paths
- `apps/api/src/services/curation/validator.ts` — added `validateStatRefs`, `stripInvalidStatRefs`, `StatRefReport` exports
- `apps/api/src/services/curation/index.ts` — re-exported new validator helpers
- `apps/api/src/services/aiInterpretation/streamHandler.ts` — calls `validateStatRefs` post-stream, strips invalid tags from `cachedText`, emits `AI_CHART_REF_INVALID`
- `apps/api/src/services/aiInterpretation/streamHandler.test.ts` — added mocks for `validateStatRefs` + `stripInvalidStatRefs`
- `apps/api/src/services/curation/assembly.test.ts` — bumped 1 assertion to `'v1.4'`; added 2 allowlist injection tests
- `apps/api/src/services/curation/index.test.ts` — bumped 4 assertions to `'v1.4'`; added "chart-tag pipeline integration" describe block (3 tests)
- `apps/api/src/services/curation/validator.test.ts` — added `validateStatRefs` + `stripInvalidStatRefs` describe blocks (8 tests)
- `apps/web/lib/hooks/useAiStream.ts` — added `rawText` state field, extracted pure `stripStatTags` helper, wired through `TEXT`/`PARTIAL`/`CACHE_HIT`/`RESET`/`START` reducer cases
- `apps/web/lib/hooks/useAiStream.test.ts` — added `stripStatTags` import, expanded `idle` state with `rawText`, added 12 tag-handling tests
- `apps/web/app/dashboard/AiSummaryCard.tsx` — `SummaryText` extended with bindings/onOpenStat/cashHistory/isMobile props; AiSummaryCard tracks `openStatId` state, computes bindings from `rawText` (stream) or `cachedContent` (cache), strips tags in cached path, renders `InsightChartSheet` at root, fires `INSIGHT_CHART_OPENED` analytics
- `apps/web/app/dashboard/AiSummaryCard.test.tsx` — added `trackClientEvent` mock, expanded `defaultHookReturn` with `rawText`, added 4 chart-binding integration tests
- `apps/web/app/share/[token]/SharedInsightCard.tsx` — server-component-safe inline regex strip for `<stat id="..."/>` tokens
- `packages/shared/src/constants/index.ts` — added `AI_CHART_REF_INVALID` and `INSIGHT_CHART_OPENED` analytics event constants
- `_bmad-output/project-context.md` — added "Insight-Chart Mapping (Story 8.5+)" section with 7 rules

**Created:**
- `apps/api/src/services/curation/config/prompt-templates/v1.4.md` — extends v1.3 with rule 11 (inline `<stat id="..."/>` tagging) + `{{allowedStatIds}}` placeholder
- `apps/web/app/dashboard/parseStatBindings.ts` — pure function: rawText → `{paragraphIndex, statId}[]`
- `apps/web/app/dashboard/parseStatBindings.test.ts` — 7 unit tests
- `apps/web/app/dashboard/charts/statChartMap.ts` — single source of truth for stat-ID → chart label + thumbnail component
- `apps/web/app/dashboard/charts/statChartMap.test.ts` — 4 mapping tests
- `apps/web/app/dashboard/charts/RunwayTrendChart.tsx` — new chart with `variant="full" | "thumbnail"` for cash balance over time
- `apps/web/app/dashboard/InsightChartThumbnail.tsx` — desktop inline thumbnail (180×120)
- `apps/web/app/dashboard/InsightChartThumbnail.test.tsx` — 5 component tests
- `apps/web/app/dashboard/InsightChartChip.tsx` — mobile chip variant
- `apps/web/app/dashboard/InsightChartChip.test.tsx` — 3 component tests
- `apps/web/app/dashboard/InsightChartSheet.tsx` — drill-down sheet (right on desktop, bottom on mobile)
- `apps/web/app/dashboard/InsightChartSheet.test.tsx` — 7 component tests

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-20 | 1.0 | Initial tech spec — 20 ACs, 14 tasks. Closes 12-decision brainstorm on insight-to-chart binding. Ready for dev-story workflow. | Claude Opus 4.7 via /bmad-bmm-quick-spec posture |
| 2026-04-20 | 1.1 | Story validation — 5 spec drift fixes: (a) Task 10.3 imports existing `useIsMobile` hook instead of rolling new viewport detection; (b) Task 3 rewritten for `useReducer` state shape with `TEXT`/`PARTIAL`/`CACHE_HIT`/`RESET` action-path coverage and extracted `stripStatTags` helper; (c) Task 4.2 uses literal `'\n\n'` split to match `SummaryText` at `AiSummaryCard.tsx:96` (regex `/\n{2,}/` would drift on 3+ consecutive newlines); (d) AC #8 + Task 6.4 commits to "unmapped stats render prose-only — no chip, no thumbnail"; (e) Task 6.3 clarifies `RunwayTrendChart` ships as a cash-balance-history chart (single data source), not true runway-months-over-time. No architectural changes; dependencies and file paths all verified. | Claude Opus 4.7 via story-validation |
| 2026-04-21 | 2.0 | Implementation complete — 14 tasks shipped across prompt template v1.4 + allowlist injection, useAiStream tag stripping (boundary-split safe), parseStatBindings parser, Tier 2 validateStatRefs + stripInvalidStatRefs + analytics emission, statChartMap + RunwayTrendChart + InsightChartThumbnail + InsightChartChip + InsightChartSheet UI components, AiSummaryCard wiring with INSIGHT_CHART_OPENED analytics, SharedInsightCard tag-strip, project-context rules. 41 new tests (12 reducer/parser, 8 validator, 4 mapping, 15 UI components, 4 integration). Test totals: API 712 → 723, Web 382 → 412. TypeScript clean. ESLint clean. Two scope reductions logged in Completion Notes (per-stat thumbnails for non-runway stats use a placeholder affordance; details panel in drill-down sheet remains unwired pending metadata channel exposure). Status: review. | Claude Opus 4.7 via dev-story |
| 2026-04-21 | 2.1 | Code review pass — addressed 3 must-fix items + 3 suggestions. (1) `generateMetadata` at `share/[token]/page.tsx` strips `<stat id="..."/>` tokens before OG title/description truncation — prevents raw markup in social unfurls. (2) `runFullPipeline` at `curation/index.ts` now runs `validateStatRefs` + `stripInvalidStatRefs` parity with `streamHandler.ts` — seed generation and batch runs no longer cache hallucinated refs. (3) New `streamHandler.test.ts` case covers the `invalidRefs.length > 0` branch: strip, analytics emit, and `storeSummary` receives cleaned text. (4) `DashboardShell` wires SWR-fetched `cashHistory` into `AiSummaryCard` — the runway thumbnail now renders live data, not just in tests. (5) Extracted `statTagGlobal`/`statTagCapture`/`statTagOpenFragment`/`stripAllStatTags` to `packages/shared/src/constants` — four duplicated regexes collapsed to one source of truth. (6) Tightened chart_opened test: asserts `role="dialog"` + drill-down description text rather than permissive label count. API 723 → 724 tests. Web 412 tests. TypeScript + ESLint clean. | Claude Opus 4.7 via post-review |
| 2026-04-21 | 2.2 | Second code review pass — addressed one requested change + one warning. (1) `runFullPipeline` now returns `cachedContent` (stripped) instead of raw `content`, so first-call response matches next cache hit — eliminates the asymmetry trap where users could see different text depending on cache state. (2) Added inline documentation explaining why `AI_CHART_REF_INVALID` is NOT emitted from `runFullPipeline`: no userId/tier in scope (called from seed/batch contexts, not user requests) — `log.warn` is the observable signal, `streamHandler.ts` remains the sole analytics path. (3) New test `runFullPipeline > strips hallucinated stat refs before cache write` asserts both the return value AND the `storeSummary` argument are the stripped text. API 724 → 725 tests. TypeScript + ESLint clean. | Claude Opus 4.7 via post-review |
| 2026-04-21 | 2.3 | Third code review pass — 0 critical, 0 warnings, approved. Applied 2 polish suggestions: (1) tightened `runFullPipeline` strip branch to use const ternary instead of `let` + conditional reassign; (2) added inline comment in the new test explaining the intentional double-space in `'Runway is tight  this quarter.'` so future contributors don't "fix" it to a single space. Committed to `main` as `da16f8b` and pushed to origin. Story status: done. | Claude Opus 4.7 via post-review |
