# sharing.ts — Interview-Ready Documentation

## Elevator Pitch

Two routers in one file: an authenticated `shareRouter` for creating share links, and a public `publicShareRouter` for viewing shared insights without logging in. This split is the backbone of the viral sharing feature — authenticated users generate links, and anyone on the internet can view them.

## Why This Approach

Share creation needs authentication (you must be logged in to share your org's insights) and RLS context (the query should only touch data within your org). Share viewing needs neither — the token in the URL is the only access control. Putting both in one file keeps the feature cohesive while exporting two separate routers that mount at different points in the Express middleware chain.

The alternative — one router with conditional auth middleware — would be more complex and error-prone. Two routers with clear names make the security boundary obvious.

## Code Walkthrough

**`shareRouter.post('/')`** — The authenticated endpoint. Parses the request body through `createShareSchema` (Zod validation from the shared package). If validation fails, throws a `ValidationError` that the global error handler catches. Then wraps the share generation in `withRlsContext`, which sets the Postgres session variable `app.current_org_id` for RLS enforcement. The service function gets a transaction handle so the share creation and AI summary lookup happen atomically.

The comment about tracking being "moved client-side" is a breadcrumb — analytics for share creation originally lived here but caused double-counting issues. Moving it to the React hook (`useCreateShareLink.ts`) fixed that.

**`publicShareRouter.get('/shares/:token')`** — The public endpoint. Validates that the token is at least 16 characters (a quick sanity check, not cryptographic validation). Delegates to `getSharedInsight`, which handles token hashing, lookup, expiry checking, and view count incrementing. The route stays thin.

The comment about `SHARE_VIEWED` analytics explains why there's no `trackEvent` call here: `analytics_events` requires a `userId`, and public viewers are anonymous. The atomic `viewCount` increment inside `getSharedInsight` covers this metric instead.

## Complexity & Trade-offs

The `withRlsContext` call on the POST route means the share creation query runs in a transaction with RLS enabled. This is a bit heavier than a plain query, but it guarantees tenant isolation. The GET route uses `dbAdmin` (inside `getSharedInsight`) because there's no authenticated user to set RLS context for.

Zod validation on the POST but minimal validation on the GET reflects the different threat models: POST data comes from your own frontend (but still needs validation), while GET tokens come from URLs that anyone could craft.

## Patterns Worth Knowing

- **Dual-router pattern**: Exporting two routers from one file for the same feature, mounted at different middleware levels. The authenticated router goes behind `authMiddleware`, the public one doesn't.
- **RLS-scoped transactions**: `withRlsContext(orgId, isAdmin, (tx) => ...)` sets Postgres session variables within a transaction. This means the database itself enforces tenant isolation — even if the application logic has a bug, RLS prevents cross-tenant access.
- **Thin routes, fat services**: Both handlers delegate to service functions immediately after validation. The route's job is HTTP concerns (parsing, status codes, response format). Business logic lives in `shareService`.

## Interview Questions

**Q: Why two separate routers instead of one with mixed auth?**
A: Clarity and safety. The authenticated router mounts behind `authMiddleware` in the Express app. The public router mounts without it. If you had one router, you'd need per-route middleware configuration, which is easy to get wrong. Two routers make the auth boundary structural, not configurational.

**Q: Why validate the token length on the GET route?**
A: It's a fast-fail optimization. Share tokens are 32+ hex characters. If someone hits `/shares/abc`, there's no point querying the database — it can't possibly match. The 16-character minimum catches obviously invalid tokens without being so strict that you reject legitimate ones from future format changes.

**Q: How does the public route handle expired shares?**
A: Inside `getSharedInsight`. The service function checks `share.expiresAt < new Date()` and throws an `AppError` with status 410 (Gone). The global error handler serializes it to the standard `{ error: { code, message } }` format.

**Q: Why no analytics event for share views?**
A: The `analytics_events` table has a NOT NULL `userId` column, and public viewers are anonymous. Rather than adding a nullable column or a sentinel user ID, the team chose to track views via the atomic `viewCount` increment on the share row itself. Simpler, and it covers the metric they actually care about.

## Data Structures

POST request body (validated by `createShareSchema`): `{ datasetId: number }`
POST response: `{ data: { token, url, expiresAt } }`
GET response: `{ data: { orgName, dateRange, aiSummaryContent, chartConfig, viewCount } }`

## Impress the Interviewer

The `withRlsContext` call on the POST route is doing something most interview candidates wouldn't think of. Beyond running a query in a transaction, it sets a Postgres session variable (`app.current_org_id`) that RLS policies reference. So even if `generateShareLink` has a bug that passes the wrong `orgId` to a query, the database-level policy would block it. Defense in depth at the database layer, not only the application layer.
