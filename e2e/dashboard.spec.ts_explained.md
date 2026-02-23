# dashboard.spec.ts — Interview Companion

## Elevator Pitch

Three Playwright E2E tests that verify the dashboard works end-to-end: the page loads with seed data, the AI summary card renders, and there are zero critical accessibility violations. These run against the full Docker Compose stack — browser → Next.js → Express → PostgreSQL → Redis.

## Why This Approach

Unit tests mock everything. E2E tests mock nothing. These tests prove the entire stack works together — React Server Components fetch data from the API, the API queries the database, and the rendered HTML reaches the browser. If any layer breaks, these tests catch it.

**What's happening:** Playwright drives a real browser against the full app stack.
**How to say it:** "Our E2E tests validate the integration between all four services. They catch issues that unit tests can't — broken API contracts, RSC hydration failures, missing database seeds."

## Code Walkthrough

**Test 1: Dashboard loads with seed data.** Navigates to `/dashboard`, waits for the `#dashboard-heading` element (which contains the org name), and checks that at least one chart element is visible. The heading proves the RSC pipeline worked — the page fetched chart data from the API and rendered it. The chart check uses a broad selector (`canvas, svg, [class*="recharts"]`) because chart libraries render differently.

**Test 2: AI summary card renders.** Looks for "Powered by AI" text, which is the footer of the `AiSummaryCard` component. For anonymous visitors, the dashboard shows a pre-cached seed summary — no streaming needed. If this text appears, the AI summary cache → API → Next.js pipeline is working.

**Test 3: Accessibility check.** Uses `@axe-core/playwright` to scan the rendered page for WCAG violations. Filters to `critical` impact only — these are barriers that prevent users from accessing content at all (missing alt text on essential images, no keyboard access to interactive elements). Asserting `critical === []` is a practical baseline that avoids false positives from minor contrast issues.

## Patterns Worth Knowing

**axe-core in Playwright** is a pattern you'll see in any accessibility-conscious codebase. `AxeBuilder` wraps the axe engine and runs it against the page's live DOM. The `analyze()` call returns a structured report with violations grouped by impact level. You filter to the severity you care about and assert.

**Generous timeouts** (15 seconds for heading, 10 seconds for charts) account for Docker Compose cold starts. The API needs to run migrations and seed data before the first request succeeds. In local dev these would be instant; in CI they need headroom.

## Interview Questions

**Q: Why use semantic selectors instead of data-testid?**
A: The `data-testid` attributes in this codebase exist in unit test mocks, not in the production components. E2E tests should use the same selectors a real user would encounter — headings, text content, ARIA labels. This also means the tests break when the user experience breaks, not when internal IDs change.

**Q: Why only Chromium?**
A: CI speed. Cross-browser testing adds 2-3x runtime for diminishing returns in a portfolio project. Chromium covers the vast majority of rendering behaviors. If this were a production app with browser-specific CSS issues, you'd add Firefox and WebKit.

**Q: How does the test get seed data without calling the Claude API?**
A: The seed script pre-generates an AI summary when `CLAUDE_API_KEY` is set. In CI, the `.env.ci` file has a dummy key, so no seed summary gets generated — but the dashboard still loads with chart data from the seed dataset. The "Powered by AI" test might need adjustment if no cached summary exists in CI.

## Impress the Interviewer

"Our E2E tests run against the full Docker Compose stack — four services, real database, real Redis. We use axe-core for automated accessibility auditing with a zero-critical-violations gate. The tests use semantic selectors instead of test IDs so they break when the user experience breaks, not when internals change."
