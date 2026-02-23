# fixtures.ts — Interview-Ready Documentation

## Elevator Pitch

The database seeding layer for E2E tests. It connects directly to PostgreSQL (bypassing the API), upserts test users with org memberships, and provides a sample CSV for upload tests. A lazy singleton connection keeps things efficient, and `cleanupFixtureConnection` ensures the pool is drained in `afterAll`.

## Why This Approach

E2E tests need known users in the database before they can authenticate and interact with the app. You could create users through the API's signup flow, but that couples test setup to the signup implementation — if signup breaks, every test fails, even ones that have nothing to do with signup.

Direct SQL inserts give you independence. The `ON CONFLICT ... DO UPDATE` (upsert) pattern means fixtures are idempotent — run the test suite twice and you get the same database state, not duplicate key errors.

## Code Walkthrough

**Constants**: `SEED_ORG_ID` is 1, matching the seed data created by `apps/api/src/db/seed.ts`. Two user presets: `TEST_USER` (admin/owner) and `FREE_TIER_USER` (non-admin/member). These cover the two RBAC dimensions — org role and platform admin status.

**`getConnection()`** — lazy singleton. Creates a `postgres` client on first call and reuses it. The `max: 2` pool size is intentionally small — E2E fixtures don't need concurrency, and a small pool avoids exhausting database connections during parallel test runs.

**`cleanupFixtureConnection()`** — closes the connection pool and nulls the reference. Called in `afterAll` to prevent connection leaks. Without this, the Node process would hang waiting for open connections to drain.

**`ensureTestUser(user, orgId)`** — the workhorse. It does two upserts:
1. Insert into `users` with `ON CONFLICT (email) DO UPDATE` — updates `is_platform_admin` and `name` on re-runs so the test user always has the expected attributes.
2. Insert into `user_orgs` with `ON CONFLICT (user_id, org_id) DO UPDATE` — ensures the user-to-org membership exists with the correct role.

Returns `{ userId, orgId }` — the minimum the caller needs to mint a JWT via `authenticateAs`.

**`SAMPLE_CSV`** — three rows of valid CSV data for upload tests. Covers multiple months and categories so chart rendering has something to work with.

## Complexity & Trade-offs

**Gained**: Idempotent, fast test setup that doesn't depend on any API endpoint working correctly. Tests can be re-run without database cleanup.

**Sacrificed**: The SQL is coupled to the database schema. If you rename the `users` table or change a column, this file breaks. That's acceptable — schema changes are rare and high-impact enough that you'd be updating tests anyway.

**Connection management**: The lazy singleton means all test files in a run share one connection. If Playwright runs test files in parallel (which it can), the `max: 2` pool handles it. If you needed more concurrency, bump the pool size.

## Patterns Worth Knowing

**Upsert for test fixtures** — `INSERT ... ON CONFLICT DO UPDATE` is the PostgreSQL way to say "create if missing, update if present." This makes fixtures idempotent — you don't need a `beforeAll` that deletes everything first. In an interview: "Upserts make test setup idempotent, which means tests are resilient to leftover data from previous runs."

**Lazy singleton** — defer resource creation until first use, then reuse. Common in test helpers where not every test file needs the resource. The null-check-and-create pattern is simple and works well for single-threaded Node.js.

## Interview Questions

**Q: Why use direct SQL instead of the API to create test users?**
A: Decoupling. If the signup endpoint has a bug, only signup tests should fail — not every E2E test that needs an authenticated user. Direct SQL gives test setup a stable foundation that's independent of application logic.

**Q: What makes the `ensureTestUser` function idempotent?**
A: The `ON CONFLICT ... DO UPDATE` clause. If the user already exists (matched by email), it updates the fields instead of failing with a duplicate key error. The same call produces the same result whether it's the first run or the hundredth.

**Q: Why limit the connection pool to 2?**
A: E2E fixtures run simple sequential queries — one upsert for the user, one for the org membership. Two connections is more than enough. A larger pool would waste database connections, which matters when multiple Playwright workers might each import this module.

## Data Structures

`TEST_USER` and `FREE_TIER_USER` are `const` objects with `email`, `name`, `googleId`, `role`, and `isAdmin`. They use `as const` for literal types, so TypeScript knows `role` is `'owner'` not `string`.

`ensureTestUser` returns `{ userId: number; orgId: number }` — the two values needed to build a JWT.

## Impress the Interviewer

The upsert approach solves a problem that plagues many test suites: "it works on first run but fails on second run." Most teams either reset the database before each run (slow) or use random UUIDs for test data (makes debugging hard). Upserts on stable, human-readable emails (`e2e-test@example.com`) give you both idempotency and debuggability. When you're looking at the database wondering "why does this test fail?", you can find the test user by email instead of hunting through random IDs.
