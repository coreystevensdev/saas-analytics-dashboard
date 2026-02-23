# analytics-events.spec.ts — Interview-Ready Documentation

## Elevator Pitch

An end-to-end Playwright test suite that verifies every analytics event the dashboard fires — page views, chart filters, transparency panel opens, CSV uploads, share link creation, and PNG exports. It drives a real browser, performs real user actions, then queries the admin API to confirm the correct event landed in the database with the right shape. This is the verification layer for FR40 (analytics event coverage).

## Why This Approach

Analytics events are easy to break silently. A developer renames a component, the `onClick` handler disappears, and nobody notices until the product team asks "why did dashboard views drop to zero?" E2E tests catch this because they exercise the full stack: browser renders the component, user action triggers the event, frontend sends it to the API, API writes it to PostgreSQL, and the test reads it back through the admin endpoint.

Unit tests can verify that "calling `trackEvent` sends the right payload," but they can't catch a broken import, a missing `onClick`, or middleware stripping the auth cookie. The E2E approach trades speed for confidence — these tests are slower but test the thing that actually matters: does the event reach the database?

## Code Walkthrough

**Setup**: `beforeAll` creates two test users via direct SQL (`ensureTestUser`) — an admin user and a free-tier user. Both are upserted so the test is idempotent across reruns. `afterAll` closes the database connection.

**`dashboard.viewed`**: Opens a new browser context, injects a JWT cookie via `authenticateAs`, navigates to `/dashboard`, waits for the heading to appear, then polls the admin API via `waitForEvent` until the `dashboard.viewed` event shows up. Asserts the event has the right `orgId` and `userId`.

**`chart.filtered` (two tests)**: One for date range, one for category. Each opens the dashboard, interacts with a filter dropdown, then checks that a `chart.filtered` event arrived with the correct `filterType` in its metadata. The tests use aria-labels to find the filter controls — `[aria-label="Filter by date range"]` and `[aria-label="Filter by category"]` — which ties the test to accessibility attributes rather than brittle CSS selectors.

**`transparency_panel.opened`**: Waits for the AI summary to load (the transparency button only appears after), clicks a button matching `/how|transparency|explain/i`, and verifies the event.

**`dataset.uploaded`**: Uploads a CSV via the BFF proxy (`/api/datasets`) using Playwright's `request.post` with multipart form data. Accepts 200, 201, or 409 (dataset already exists from a prior run). Only asserts the event if the upload created something new.

**`share_link.created` / `insight.exported`**: Both follow the same pattern — navigate to dashboard, wait for AI summary, find and click a button, verify the event. These use conditional assertions (`if (await button.count() > 0)`) because the button might not render in all states.

**`event shape validation`**: A structural test that queries all recent events for the org and asserts every one has the required fields (`id`, `eventName`, `orgId`, `userId`, `createdAt`) with correct types. This catches schema drift — if someone adds a column but forgets to include it in the API response.

## Complexity & Trade-offs

**Gained**: True end-to-end confidence that analytics events survive the full request lifecycle. Tests are readable — each one mirrors a user story.

**Sacrificed**: Speed. Each test opens a fresh browser context and waits for page loads. The `waitForEvent` helper polls with 500ms delays because analytics writes are fire-and-forget (async). A full run of this suite takes 30-60 seconds.

**Flakiness surface**: The polling approach (`waitForEvent` with 5 retries at 500ms) handles the async nature of analytics writes, but slow CI environments might need higher `maxAttempts`. The conditional button assertions (`.count() > 0`) prevent failures when UI elements aren't present, but they also mean the test silently passes if the button never renders. That's a conscious trade-off — better to have a test that occasionally no-ops than one that fails on every CI run due to timing.

## Patterns Worth Knowing

**Poll-based async assertions** — analytics events are fire-and-forget on the frontend. The event might not be in the database by the time the test queries for it. `waitForEvent` retries up to 5 times with 500ms gaps. In an interview, this is called "eventually consistent assertions" or "retry-based polling."

**Fresh browser context per test** — each test creates its own `browser.newContext()` with its own cookies. No cookie leakage between tests. This is the Playwright equivalent of "test isolation."

**Admin API as test oracle** — instead of reading the database directly, tests query the admin analytics endpoint. This validates both the write path (event was created) and the read path (admin API returns it correctly).

## Interview Questions

**Q: Why not just unit-test the analytics tracking function?**
A: Unit tests verify the function itself works, but analytics bugs happen at the integration layer — a missing import, a renamed prop, an event handler that stops firing after a refactor. E2E tests catch those because they drive the actual UI. Both levels are valuable, but only E2E confirms the event reaches the database through the real code path.

**Q: How do you handle the async gap between firing an event and it being queryable?**
A: The `waitForEvent` helper polls the admin API up to 5 times with 500ms intervals. Analytics writes are fire-and-forget — the frontend doesn't wait for them. Polling with retries handles the eventual consistency without brittle `sleep` calls.

**Q: Why do some tests use conditional assertions (`if button.count() > 0`)?**
A: The share and export buttons only render after AI summaries load, and their visibility depends on subscription tier and data state. A hard assertion would make the test flaky in environments where the AI service is slow or unavailable. The conditional means "test the event if the button exists, skip gracefully if it doesn't." It's a pragmatic trade-off between coverage and reliability.

**Q: What's the `since` timestamp used for?**
A: Each test captures `new Date().toISOString()` before performing the action, then passes it to `waitForEvent` as a floor. This scopes the query to events created after the test started, preventing false positives from events left by previous test runs.

## Data Structures

The test works with `AnalyticsEvent` objects (defined in `helpers/admin.ts`):

```typescript
{
  id: number;
  orgId: number;
  userId: number;
  eventName: string;           // 'dashboard.viewed', 'chart.filtered', etc.
  metadata: Record<string, unknown> | null;  // { filterType: 'date_range' }, { format: 'png' }, etc.
  createdAt: string;           // ISO timestamp
}
```

The event shape validation test at the end confirms this structure holds for every event in the database, not just the ones this suite created.

## Impress the Interviewer

The test suite covers a requirement (FR40) that most teams forget to test at all. Analytics is often a "fire and pray" situation — you add tracking calls and hope the data shows up in the dashboard. This suite treats analytics as a first-class feature with its own E2E coverage, including a structural test that validates the event schema. In an interview, you can say: "We test analytics events end-to-end because silent tracking failures are invisible until someone checks the analytics dashboard three weeks later. By then you've lost the data." That shows you think about observability, not just functionality.
