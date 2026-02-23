# admin.ts — Interview-Ready Documentation

## Elevator Pitch

This module holds every cross-org database query the platform admin panel needs — org listings, user listings, org detail views, and aggregate stats. Because these queries ignore tenant boundaries (no `orgId` filter), access control lives entirely at the route layer via `roleGuard('admin')`, and the queries themselves use `dbAdmin` (a connection that bypasses row-level security).

## Why This Approach

Most queries in this codebase are scoped to a single org — that's the whole point of multi-tenant RLS. Admin queries are the exception. Rather than sprinkling `dbAdmin` usage across random service files, all cross-org reads live here, making it obvious where tenant isolation is deliberately bypassed.

The alternative would be parameterized queries that accept an optional `orgId` and skip the WHERE clause when it's missing. That's fragile — one forgotten guard and you've got a data leak. Separating admin queries into their own file makes the boundary explicit.

## Code Walkthrough

**`getAllOrgs()`** — A single query that joins `orgs` to `userOrgs`, `datasets`, and `subscriptions`, then groups by org. The `cast(count(distinct ...) as int)` calls are worth noting: Drizzle returns `bigint` from Postgres `count()`, and the cast avoids serialization headaches in JSON responses. The `groupBy` includes `subscriptions.plan` because it's a non-aggregated select column.

**`getAllUsers()`** — This one deliberately avoids joining users to orgs in a single query. If a user belongs to 3 orgs, a naive join produces 3 rows per user. Instead, it runs two queries and stitches them together in-memory with a `Map`. The comment says "avoid cross-join blowup" — that's the reason. For an admin panel with hundreds (not millions) of users, two fast queries beat one slow one with deduplication logic.

**`getOrgDetail(orgId)`** — Three parallel-ish queries: members, datasets, and subscription. They're awaited sequentially here (not `Promise.all`), which is a minor missed optimization, but the simplicity is worth it for an admin-only endpoint that sees low traffic.

**`getAdminStats()`** — Three `count()` queries. Simple, fast, no joins. Returns a flat object for the dashboard summary cards.

## Complexity & Trade-offs

The two-query approach in `getAllUsers()` trades one round-trip for cleaner data. At scale (10k+ users), you'd want pagination anyway, so this pattern holds up. The `getOrgDetail` function does N+1-ish work (org + members + datasets + subscription), but N is always 4 fixed queries, not proportional to data size.

Using `dbAdmin` means these queries run outside RLS. That's the trade-off: you get cross-tenant visibility but lose the safety net. The mitigation is that this entire file is only imported by `adminService.ts`, which is only called from admin-gated routes.

## Patterns Worth Knowing

- **Deliberate denormalization in the query layer**: `getAllOrgs` computes `memberCount` and `datasetCount` inline rather than storing them. This avoids stale counters at the cost of a slightly heavier query.
- **Map-based join in application code**: The `membershipsByUser` Map in `getAllUsers` is a common pattern when SQL joins produce awkward cardinality. In an interview, call this "application-side join" or "post-query enrichment."
- **Bypassing RLS with a dedicated connection**: `dbAdmin` is a separate Drizzle instance that connects without setting `app.current_org_id`. This is how you handle legitimate cross-tenant queries without weakening your RLS policies.

## Interview Questions

**Q: Why not use a single JOIN query in `getAllUsers()`?**
A: A user belonging to multiple orgs would produce multiple rows. You'd need `GROUP BY` with `json_agg` or similar, which gets messy in Drizzle's type system. Two queries with an in-memory Map is simpler, type-safe, and fast enough for admin-scale data.

**Q: What's the risk of using `dbAdmin` here?**
A: It bypasses row-level security, so any bug that exposes these functions to non-admin callers leaks cross-tenant data. The mitigation is architectural: this file only feeds `adminService.ts`, which only serves admin-gated routes. Defense in depth.

**Q: Why `cast(count(distinct ...) as int)` instead of just `count()`?**
A: PostgreSQL `count()` returns `bigint`. JavaScript can't natively handle `bigint` in JSON serialization (`JSON.stringify` throws). The cast to `int` avoids that, and admin-scale counts will never exceed 2^31.

**Q: How would you add pagination to `getAllOrgs()`?**
A: Add `limit` and `offset` parameters, pass them to `.limit()` and `.offset()` on the query builder. Return a `{ rows, total }` shape where `total` comes from a separate `count()` query (or use a window function). The `orderBy(orgs.createdAt)` already provides a stable sort.

## Data Structures

The return types aren't explicitly defined — they're inferred from the Drizzle `select()` calls. Key shapes:

- `getAllOrgs()` returns `{ id, name, slug, createdAt, memberCount, datasetCount, subscriptionTier }[]`
- `getAllUsers()` returns `{ id, email, name, isPlatformAdmin, createdAt, orgs: { orgId, orgName, role }[] }[]`
- `getOrgDetail()` returns `{ id, name, slug, createdAt, members, datasets, subscription } | null`
- `getAdminStats()` returns `{ totalOrgs, totalUsers, proSubscribers }`

## Impress the Interviewer

Point out that this file is the *only* place in the query layer that uses `dbAdmin`. Every other query module uses the RLS-scoped `db` connection. That separation is a conscious architectural boundary — admin queries are quarantined, not mixed in with tenant-scoped logic. If someone adds a new admin feature, they know exactly where the queries go. If someone audits for RLS bypasses, they only need to check this one file.
