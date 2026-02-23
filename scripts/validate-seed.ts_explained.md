# validate-seed.ts — Interview Companion

## Elevator Pitch

A CI script that proves the AI curation pipeline works without calling the AI. It runs the deterministic parts — stats computation, scoring, prompt assembly — against fake seed data and asserts the output contains enough variety to be useful. Zero cost, runs in milliseconds, catches pipeline regressions before they reach production.

## Why This Approach

The curation pipeline has three layers: compute stats from raw data, score those stats by relevance, assemble them into an LLM prompt. The first two are pure functions — same input, same output. The third is string templating. None of them need the Claude API.

**What's happening:** We validate the pipeline's deterministic output instead of the LLM response.
**How to say it:** "We test the contract between our data layer and the LLM — if the assembled prompt has the right stat categories, the LLM gets good input regardless of its response."

The alternative — calling Claude in CI — would be slow, expensive, and non-deterministic. A test that passes 95% of the time isn't a test.

## Code Walkthrough

The script does four things:

1. **Builds synthetic data** that mirrors the real seed data (72 rows, 6 categories, 12 months). It duplicates the shape of `buildSeedRows` from `seed.ts` because that function isn't exported. The data includes deliberate anomalies (December revenue spike, October payroll spike) so the anomaly detector has something to find.

2. **Runs the pipeline chain**: `computeStats(rows)` → `scoreInsights(stats)` → `assemblePrompt(insights)`. Each function is imported from its individual file — not from the barrel `index.ts`, which would pull in the database layer and crash without env vars.

3. **Asserts quantity**: at least 2 distinct stat types (like `trend`, `anomaly`, `category_breakdown`) must appear in the assembled context. In practice it produces 3, but the threshold of 2 gives the test some breathing room if scoring weights shift.

4. **Exits with code 1 on failure** — CI treats any non-zero exit as a failed stage.

## Complexity / Trade-offs

**Import isolation is the main trick.** The curation barrel (`index.ts`) re-exports everything but also imports database and config modules that crash without `DATABASE_URL`, `JWT_SECRET`, etc. Importing individual files sidesteps this dependency chain entirely. It's a bit fragile — if someone adds a DB import to `computation.ts`, this script breaks. But that would also break the computation layer's purity, which is a bigger problem.

**Duplicated seed data construction.** The script rebuilds the seed rows inline instead of importing `buildSeedRows`. This is intentional duplication — the alternative (exporting `buildSeedRows`) would change the seed module's public API for a test script's convenience. If the seed data shape changes, you'd want this script to fail anyway.

## Patterns Worth Knowing

**Pipeline validation without integration testing.** You're testing that a multi-step pipeline produces correct intermediate output. This pattern works anywhere you have a chain of pure functions feeding into an impure one (API call, DB write, file I/O). Validate the boundary between pure and impure.

**The `lerp` helper** does linear interpolation across 12 months — `monthIndex 0` returns `minVal`, `monthIndex 11` returns `maxVal`. It's how the seed data creates realistic trends without hardcoding 72 values.

## Interview Questions

**Q: Why not just mock the Claude API and test the full pipeline?**
A: Because the mock would test our assumptions about Claude's response format, not whether our pipeline produces good prompts. The seed validation tests the contract we control. The LLM response is tested separately through cached seed summaries.

**Q: What happens if someone adds a new StatType?**
A: The script checks for 2+ *distinct* types from the existing enum. A new type would just increase the count. The script would only fail if the new type *replaced* existing ones and brought the distinct count below 2.

**Q: How does tsx resolve the imports without path aliases?**
A: tsx runs TypeScript directly via esbuild transforms. It respects `import.meta.url` for file path resolution (which `scoring.ts` and `assembly.ts` use to load their config files) but doesn't resolve `@/` aliases from tsconfig. The script uses relative paths like `../apps/api/src/services/curation/computation.js` instead.

## Data Structures

The key interface flowing through the pipeline:

```
DataRow { category, date, amount }
  → ComputedStat { statType, category, value, details }
    → ScoredInsight { stat, score, breakdown }
      → AssembledContext { prompt, metadata }
```

`metadata.statTypes` is the array this script checks — it's a `string[]` of stat type values like `["anomaly", "trend", "category_breakdown"]`.

## Impress the Interviewer

"The seed validation is a zero-cost smoke test for our AI pipeline. It runs the deterministic layers — stats, scoring, prompt assembly — against synthetic data and asserts the output has enough variety to be useful. It catches regressions in the curation logic without ever touching the Claude API. In CI, it runs in under a second and costs nothing."

You could also mention: "The import strategy is intentional — we import individual module files instead of the barrel export to avoid pulling in database dependencies that would crash without env vars. It's a pragmatic trade-off between import ergonomics and test isolation."
