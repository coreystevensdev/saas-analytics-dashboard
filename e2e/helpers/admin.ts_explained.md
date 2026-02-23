# admin.ts — Interview-Ready Documentation

## Elevator Pitch

Two helper functions for E2E tests that need to verify analytics events reached the database. `queryAnalyticsEvents` hits the admin API endpoint with filters, and `waitForEvent` wraps it in a retry loop to handle the async gap between firing an event and it being queryable. Together they turn "did this analytics event get recorded?" into a one-liner in any test.

## Why This Approach

Analytics writes are fire-and-forget — the frontend dispatches them and moves on. By the time a Playwright test checks the database, the event might not be there yet. You need a polling mechanism.

The alternative is a hard `sleep(2000)` before querying. That's wasteful (waits even when the event lands in 50ms) and flaky (fails when CI is slow). Polling with short intervals and a max attempt count gives you fast tests when things work and a bounded timeout when they don't.

Querying through the admin API (rather than a direct database connection) has a bonus: it also validates the admin endpoint itself. If the API changes its response format, these tests break — which is what you want.

## Code Walkthrough

**`queryAnalyticsEvents`** builds a query string from the options (`eventName`, `since`, `orgId`, `limit`), GETs `/api/admin/analytics-events`, and returns the `data` array from the JSON response. Throws on non-2xx responses so test failures are loud.

**`waitForEvent`** calls `queryAnalyticsEvents` in a loop, looking for an event matching `eventName`. It tries up to `maxAttempts` times (default 5), waiting 500ms between attempts. Returns the matching event or `null` if it never appears. The 500ms interval balances between responsiveness (most events land within a second) and not hammering the server.

## Complexity & Trade-offs

Low complexity, high utility. The retry loop is O(maxAttempts) with a constant delay. The main trade-off: `waitForEvent` returns `null` instead of throwing on timeout. This lets callers decide whether a missing event is a test failure or an acceptable condition (some tests use conditional assertions).

## Patterns Worth Knowing

**Polling with bounded retries** — a common pattern for testing eventually consistent systems. You'll see it in tests for message queues, webhooks, and async jobs. The key parameters are interval (500ms), max attempts (5), and what to return on exhaustion (null vs throw). In an interview: "I used bounded polling instead of a fixed sleep to keep tests fast in the common case and bounded in the worst case."

**Test oracle via API** — using the application's own API as the source of truth for test assertions, rather than querying the database directly. This validates both the write and read paths.

## Interview Questions

**Q: Why 500ms between retries? Why not shorter?**
A: It's a balance. 100ms would mean more HTTP requests to the test server, which adds noise. 500ms means most events are caught on the first or second attempt (analytics writes typically complete in under a second), and the worst case is 2.5 seconds — fast enough for CI.

**Q: Why return `null` instead of throwing when the event isn't found?**
A: Some tests use conditional assertions — they check for an event only if a UI element was visible. Throwing would force every caller to try/catch, which clutters the test code. Returning `null` lets the caller decide: `expect(event).not.toBeNull()` when the event is mandatory, or `if (event)` when it's conditional.

**Q: Could this create false positives by matching events from a previous test run?**
A: No — callers pass a `since` timestamp captured right before the action under test. The query filters to events created after that timestamp, so stale events from earlier runs don't match.

## Data Structures

```typescript
interface AnalyticsEvent {
  id: number;
  orgId: number;
  userId: number;
  eventName: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}
```

`QueryOptions` controls filtering: `eventName` for the event type, `since` for a time floor, `orgId` for tenant scoping, and `limit` to cap result size.

## Impress the Interviewer

The retry loop with `null` return is a small design choice that has outsized impact on test ergonomics. It lets the same helper serve both "this event MUST exist" tests and "this event SHOULD exist if the button was visible" tests without any branching in the helper itself. The complexity stays in the caller, where it belongs. In an interview, this demonstrates understanding of API design — even for test utilities.
