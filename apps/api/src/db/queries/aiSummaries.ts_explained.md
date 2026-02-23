# aiSummaries.ts — Interview-Ready Documentation

## Elevator Pitch

Three functions that manage the AI summary cache — fetch a non-stale summary, store a new one, and mark existing ones as stale. This is the persistence layer for a cache-first AI strategy: generate an expensive LLM summary once, serve it from the database until the underlying data changes.

## Why This Approach

LLM calls are slow (seconds) and expensive (tokens cost money). Instead of regenerating summaries on every page load, this project stores them in an `ai_summaries` table and serves cached versions. When a user uploads new data, existing summaries get marked stale (soft-invalidation) rather than deleted, preserving history.

The alternative — a Redis cache with TTL — would be simpler but loses the summary history and transparency metadata. Since summaries include prompt versions and metadata for a transparency panel, database storage makes more sense.

## Code Walkthrough

**`getCachedSummary(orgId, datasetId, client)`** — Finds the first summary matching the org and dataset where `staleAt` is null. The `isNull(aiSummaries.staleAt)` check is the cache-hit condition. If a summary exists but has been marked stale, it's invisible to this query.

**`storeSummary(...)`** — Inserts a new row with the AI-generated content, transparency metadata (what stats fed the prompt, token counts, etc.), and the prompt version string. The `isSeed` flag distinguishes pre-generated demo summaries from live ones. Returns the inserted row via `.returning()`.

**`markStale(orgId, client)`** — Sets `staleAt = now()` on all non-stale summaries for an org. This fires when new data is uploaded. It marks *all* summaries for the org as stale, not just one dataset — that's a deliberate choice since new data might change cross-dataset comparisons.

Every function accepts an optional `client` parameter (defaults to `db`). This lets callers pass a transaction handle, so cache operations can be atomic with the data operations that trigger them.

## Complexity & Trade-offs

Soft-invalidation (setting `staleAt`) instead of hard deletion means the table grows over time. You'd eventually want a cleanup job that prunes old stale rows. The upside is auditability — you can see what summaries were generated and when they went stale.

The `markStale` function invalidates by org, not by dataset. This is slightly aggressive (uploading data to dataset A stales dataset B's summary too), but it's the safe default. A dataset-scoped invalidation could miss cases where cross-dataset insights reference the stale data.

## Patterns Worth Knowing

- **Transaction-compatible queries**: The `client` parameter pattern lets these functions participate in transactions without being coupled to transaction management. In an interview, call this "dependency injection for the database client."
- **Soft invalidation**: Marking records stale instead of deleting them. Common in caching layers where you want to preserve history or allow graceful degradation (show stale data while regenerating).

## Interview Questions

**Q: Why accept a `client` parameter instead of always using the module-level `db`?**
A: So callers can wrap multiple operations in a transaction. If you're storing a summary right after computing stats, both should succeed or fail together. The default value (`db`) means callers who don't care about transactions get sensible behavior for free.

**Q: What happens if two requests try to store a summary for the same dataset simultaneously?**
A: Both inserts succeed — there's no unique constraint on `(orgId, datasetId)` for non-stale rows. `getCachedSummary` uses `findFirst`, so it returns whichever one the database finds first. In practice, the AI generation endpoint should be debounced or locked upstream to prevent this.

**Q: Why mark stale instead of deleting?**
A: Auditability. You can track how often summaries are regenerated, compare prompt versions over time, and debug issues by looking at historical summaries. Deletion loses that signal.

## Data Structures

The `aiSummaries` table (referenced via schema) has these key columns:
- `orgId`, `datasetId` — tenant and dataset scope
- `content` — the full AI-generated summary text
- `transparencyMetadata` — JSONB with stats, token counts, date ranges used
- `promptVersion` — version string for the prompt template
- `isSeed` — boolean flag for pre-generated demo summaries
- `staleAt` — nullable timestamp; null means "current," non-null means "invalidated"

## Impress the Interviewer

The `transparencyMetadata` column is the interesting bit. This project has a transparency panel that shows users exactly what data fed the AI summary and which prompt version generated it. Storing that metadata alongside the cached summary means you can reconstruct "why did the AI say this?" at any point — even for stale summaries. That's a privacy-by-design choice, not just a caching optimization.
