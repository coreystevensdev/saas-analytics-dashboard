# shareService.ts — Interview-Ready Documentation

## Elevator Pitch

The business logic for shareable insight links. `generateShareLink` creates a cryptographically random token, snapshots the current AI summary, and stores a hashed version in the database. `getSharedInsight` takes a raw token from a URL, hashes it, looks up the share, checks expiry, increments the view count, and returns the frozen insight. Together, they form the viral acquisition loop — users share insights, recipients see them without logging in.

## Why This Approach

Share links need three properties: they must be unguessable (cryptographic randomness), they must not leak data if the database is breached (token hashing), and they must show a stable snapshot (not live data that might change). This service handles all three concerns.

The snapshot pattern — freezing the AI summary at share-creation time — means shared links are stable artifacts. A recipient sees exactly what the sharer intended, even if the underlying data changes later. This is important for trust: if you share a revenue insight with your business partner, it shouldn't silently change the next day.

## Code Walkthrough

**`hashToken(raw)`** — SHA-256 hash of the raw token string. One-way: you can go from token to hash, but not hash to token. The raw token goes in the URL; the hash goes in the database.

**`generateShareLink(orgId, datasetId, createdBy, client)`**:

1. Fetches the cached AI summary for this dataset. If none exists, throws a `ValidationError` — you can't share what doesn't exist yet.
2. Looks up the org name (via `dbAdmin` since the `orgs` table has no `org_id` column for RLS — it *is* the org entity).
3. Extracts the date range from the summary's transparency metadata, falling back to a default string.
4. Builds an `InsightSnapshot` object — the frozen-in-time representation of the insight.
5. Generates a random token (`randomBytes` → hex string) and hashes it.
6. Sets the expiry date (configurable via `SHARES.DEFAULT_EXPIRY_DAYS`).
7. Persists the share row and returns the raw token + full URL + expiry to the caller.

The raw token is returned to the client so it can build the share URL. The hash is what gets stored. The client never sees the hash, and the database never stores the raw token.

**`getSharedInsight(rawToken)`**:

1. Hashes the incoming token.
2. Looks it up via `dbAdmin` (no authenticated user = no RLS context).
3. Returns 404 if not found, 410 if expired.
4. Increments the view count atomically.
5. Returns the snapshot data plus the updated view count.

The `viewCount + 1` in the return is a UI optimization — the increment happens in the database, but the returned share object has the *pre-increment* count. Adding 1 gives the caller the correct post-increment value without a second query.

## Complexity & Trade-offs

**Token entropy**: `SHARES.TOKEN_BYTES` controls token length. With 32 bytes (256 bits), the token space is large enough that brute-forcing is infeasible. The hex encoding doubles the string length (64 characters), which is fine for URLs.

**Snapshot staleness**: The insight snapshot is frozen at creation time. If the user regenerates their AI summary, existing share links don't update. This is by design, but it means users might share outdated information. A "regenerate share" feature could address this later.

**`dbAdmin` usage in `getSharedInsight`**: Public share viewers aren't authenticated, so there's no user context for RLS. Using `dbAdmin` bypasses RLS, which is correct here — the token hash is the access control, not org membership. The comment in the code calls this out explicitly.

**Org lookup bypasses RLS**: The `orgs` table doesn't have an `org_id` column (it *is* the entity that org_id references), so RLS policies don't apply to it. The code queries it through a non-RLS path and documents why.

## Patterns Worth Knowing

- **Bearer token with hash storage**: Generate random bytes → give raw to user → store hash in DB. On lookup, hash the incoming token and query by hash. Same pattern as API keys, password reset tokens, and session tokens. In an interview, compare it to bcrypt for passwords but note that SHA-256 is sufficient for high-entropy random tokens (no salt needed because the input isn't guessable).
- **Snapshot/point-in-time capture**: Freezing data at creation time rather than joining to live tables. Used in invoicing (invoice line items are snapshots, not live product prices), receipts, and audit logs.
- **Discriminated status handling**: The caller (`sharing.ts` route) doesn't check for expiry or existence — the service throws typed errors (`NotFoundError`, `AppError` with 410) that the global error handler converts to HTTP responses. Each error type maps to a specific status code.

## Interview Questions

**Q: Why SHA-256 instead of bcrypt for token hashing?**
A: Bcrypt is designed for low-entropy inputs (passwords) where you need to slow down brute-force attacks. Share tokens are generated from `randomBytes` with 256 bits of entropy — there's nothing to brute-force. SHA-256 is fast, deterministic, and sufficient for high-entropy tokens. Using bcrypt would add unnecessary latency on every share view.

**Q: What happens if two users share the same dataset simultaneously?**
A: Each gets a different random token and a different share row. The `randomBytes` function uses the OS CSPRNG, so collisions are astronomically unlikely (2^-128 for 32-byte tokens). Even if they shared the same dataset, each share is an independent artifact with its own snapshot, token, and expiry.

**Q: How would you add share revocation?**
A: Add a `revokedAt` timestamp column to the `shares` table. In `getSharedInsight`, check `share.revokedAt` the same way you check `share.expiresAt`. Add a `DELETE /shares/:id` endpoint (authenticated, RLS-scoped) that sets `revokedAt`. The share row stays in the database for audit purposes.

**Q: Why is the org lookup done through `orgsQueries` instead of the RLS-scoped `client`?**
A: The `orgs` table has no `org_id` column — it's the root entity that other tables reference via `org_id`. RLS policies on this table would need a different approach (checking `orgs.id` against the session variable), and the project chose to handle org access at the application layer instead. The query uses a non-RLS path, which is safe here because the function already verified the org via the `orgId` parameter.

## Data Structures

```typescript
// What gets stored in the shares table
type InsightSnapshot = {
  orgName: string;
  dateRange: string;
  aiSummaryContent: string;
  chartConfig: Record<string, unknown>;
};

// What generateShareLink returns to the caller
type ShareLinkResult = {
  token: string;       // raw token for the URL
  url: string;         // full URL like https://app.example.com/share/abc123...
  expiresAt: Date;
};

// What getSharedInsight returns
type SharedInsightResult = {
  orgName: string;
  dateRange: string;
  aiSummaryContent: string;
  chartConfig: Record<string, unknown>;
  viewCount: number;
};
```

## Impress the Interviewer

The privacy architecture here is layered and deliberate. The raw data never reaches the LLM (privacy-by-architecture in the curation pipeline). The AI summary gets frozen into a snapshot at share time (no live data access through share links). The token is hashed before storage (database breach doesn't expose valid URLs). And the whole thing expires automatically after N days. That's four layers of data protection in a feature whose primary purpose is *sharing* data. Being able to articulate how sharing and privacy coexist — that's what separates a senior-level answer from a junior one.
