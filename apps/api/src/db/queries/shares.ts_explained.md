# shares.ts — Interview-Ready Documentation

## Elevator Pitch

Four database operations for shareable insight links: create a share, look one up by its token hash, increment the view counter, and list all shares for an org. This is the persistence layer behind the viral sharing feature that lets users send AI-generated insights to people who don't have accounts.

## Why This Approach

Shares are public-facing — anyone with the link can view the insight. That means the lookup (`findByTokenHash`) can't rely on an authenticated user or RLS context. The token itself is the access control. Storing a hash (not the raw token) means a database breach doesn't expose valid share URLs.

## Code Walkthrough

**`createShare(...)`** — Inserts a share row with the token hash, a snapshot of the insight content, who created it, and when it expires. The `insightSnapshot` is a frozen copy of the AI summary at share-creation time — if the summary later gets regenerated, the shared link still shows what was shared. Throws if the insert somehow fails to return a row (shouldn't happen, but the guard keeps TypeScript happy).

**`findByTokenHash(tokenHash, client)`** — Uses Drizzle's relational query API (`client.query.shares.findFirst`) with `with: { org: true }` to eagerly load the org. This is a single query with a join under the hood. The caller (shareService) needs the org name for display.

**`incrementViewCount(id, client)`** — Atomic increment via `sql\`${shares.viewCount} + 1\``. This avoids read-modify-write race conditions — two simultaneous viewers both get their increments recorded. Returns the updated row.

**`getSharesByOrg(orgId, client)`** — Simple listing query for the org's share management UI.

All four accept an optional `client` for transaction support, same pattern as the other query modules.

## Complexity & Trade-offs

The atomic `viewCount` increment is a deliberate workaround. Ideally, you'd track share views in `analytics_events`, but that table requires a `userId` and public viewers are anonymous. The counter gives you aggregate data without requiring authentication.

Storing `insightSnapshot` as a JSONB column means the shared view is a frozen-in-time copy. If the user later deletes their data or the AI generates a better summary, the share doesn't change. That's both a feature (stable links) and a trade-off (no way to "update" a share's content).

## Patterns Worth Knowing

- **Token hashing for bearer-style access**: Store `sha256(token)` in the DB, give the raw token to the user. Same pattern as password hashing but simpler (no salt needed for random tokens with sufficient entropy). In an interview, compare this to how GitHub personal access tokens work.
- **Atomic SQL increment**: `SET viewCount = viewCount + 1` is a single atomic operation at the database level. No application-level locking needed.
- **Snapshot pattern**: Freezing data at creation time rather than joining to live tables. Useful when the shared artifact needs to be stable regardless of future data changes.

## Interview Questions

**Q: Why hash the token instead of storing it in plain text?**
A: If the database is compromised, raw tokens would let an attacker access every shared insight. Hashing means they'd need to brute-force random hex strings, which is computationally infeasible with sufficient token length.

**Q: Why is `incrementViewCount` atomic instead of read-then-write?**
A: Two concurrent requests could both read `viewCount = 5`, increment to 6, and write 6 — losing a count. The SQL `SET viewCount = viewCount + 1` is executed by the database as a single atomic operation, so concurrent requests always produce the correct total.

**Q: Why snapshot the insight instead of joining to the live `ai_summaries` table?**
A: Stability. If a user uploads new data and the AI generates a different summary, existing share links should still show what was originally shared. Joining to live data would make share links unpredictable.

## Data Structures

The `shares` table key columns:
- `tokenHash` — SHA-256 hex of the raw share token
- `insightSnapshot` — JSONB containing `{ orgName, dateRange, aiSummaryContent, chartConfig }`
- `viewCount` — integer, atomically incremented
- `expiresAt` — timestamp for link expiration
- `createdBy` — foreign key to the user who created the share

## Impress the Interviewer

The `with: { org: true }` in `findByTokenHash` is doing something subtle. Public share viewers don't have auth context, so this query runs through `dbAdmin` (no RLS). But it still needs the org name for the share card display. Rather than a separate query, Drizzle's relational query API handles the join in one shot. It's a small thing, but it shows awareness of query efficiency even in "simple" lookup code.
