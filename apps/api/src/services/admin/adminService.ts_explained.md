# adminService.ts — Interview-Ready Documentation

## Elevator Pitch

A thin service layer that sits between the admin routes and the admin query module. Three functions: get all orgs with summary stats, get all users, and get a single org's detail. Its main job is to aggregate the query calls and throw `NotFoundError` when an org doesn't exist.

## Why This Approach

The project follows a strict layering convention: routes handle HTTP, services handle business logic, queries handle SQL. Even when the "business logic" is just "call the query and maybe throw a 404," the service layer exists so routes never import from the query layer directly. This keeps the dependency graph clean: `route → service → queries`.

You could argue this file is over-abstracted for what it does. Fair. But consistency across the codebase means every feature follows the same pattern. A developer looking at the admin feature finds the same structure as the sharing feature, the subscription feature, etc. Predictability matters more than minimalism here.

## Code Walkthrough

**`getOrgsWithStats()`** — Fires `getAllOrgs()` and `getAdminStats()` in parallel with `Promise.all`, then returns both. The parallel execution is a small optimization — the dashboard page needs both pieces of data, and they're independent queries.

**`getUsers()`** — A straight passthrough to `adminQueries.getAllUsers()`. Exists for layering consistency.

**`getOrgDetail(orgId)`** — Calls the query, checks for null, throws `NotFoundError` if missing. The error handler catches this and returns a 404 response.

## Complexity & Trade-offs

This is a "boring" file, and that's the point. The complexity lives in the query layer (joins, aggregations) and the route layer (auth guards, response formatting). The service layer is the glue.

The `Promise.all` in `getOrgsWithStats` is the only non-trivial thing here. It saves one round-trip worth of latency compared to sequential awaits.

## Patterns Worth Knowing

- **Service layer as error boundary**: The query returns `null`, the service throws `NotFoundError`. This pattern centralizes "not found" logic in the service layer so routes don't need null checks.
- **Parallel independent queries**: `Promise.all` for queries that don't depend on each other. Simple, but interviewers like hearing you articulate *why* they're safe to parallelize (no shared state, no ordering dependency).

## Interview Questions

**Q: Why have a service layer when it's mostly passthrough?**
A: Consistency. Every feature in the codebase follows `route → service → queries`. If admin logic grows (say, adding org suspension or user impersonation), the service layer is already in place. You don't have to refactor the import graph later.

**Q: Why `Promise.all` instead of sequential awaits in `getOrgsWithStats`?**
A: The two queries are independent — `getAllOrgs` doesn't need the result of `getAdminStats` or vice versa. Running them in parallel cuts the endpoint's latency roughly in half (two ~50ms queries take ~50ms total instead of ~100ms).

**Q: Where does the admin authorization check happen?**
A: In the route layer, via `roleGuard('admin')` middleware. By the time `adminService` functions are called, the request has already been verified as coming from a platform admin. The service layer trusts the route layer to enforce access control.

## Data Structures

No new types — returns whatever the query functions return. See `admin.ts_explained.md` for the query return shapes.

## Impress the Interviewer

The `Promise.all` in `getOrgsWithStats` is a micro-optimization, but it signals something bigger: you think about the request lifecycle holistically. Most junior developers would write two sequential `await` calls and never notice. Parallelizing independent I/O operations is a habit that scales — it's the same instinct that leads to concurrent database migrations, parallel test suites, and efficient batch processing.
