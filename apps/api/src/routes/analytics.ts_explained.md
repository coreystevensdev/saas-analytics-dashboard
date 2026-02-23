# analytics.ts — Interview-Ready Documentation

## Elevator Pitch

A single-endpoint router that accepts client-side analytics events (button clicks, page views, feature usage) and fires them into the analytics tracking system. It's fire-and-forget — the client doesn't wait for the event to be persisted, and failures don't affect the user experience.

## Why This Approach

Product analytics events originate on the client (the user clicked something, viewed something, toggled something). The client sends them to this endpoint, which extracts the authenticated user's identity from the JWT and passes the event to `trackEvent`. The endpoint returns immediately — it doesn't `await` the tracking call, making it effectively non-blocking.

The alternative would be embedding analytics in every backend route handler. That spreads analytics logic everywhere and makes it harder to add/remove tracked events. Centralizing client-initiated events through one endpoint keeps the surface area small.

## Code Walkthrough

The route handler casts `req` to `AuthenticatedRequest` to access `user.org_id` and `user.sub` (the JWT claims). It validates that `eventName` exists and is a string — minimal validation since this is a fire-and-forget endpoint. Then it calls `trackEvent` without `await` and returns `{ data: { ok: true } }` immediately.

The `as AnalyticsEventName` cast is a type assertion, not runtime validation. The `trackEvent` function accepts the union type but doesn't blow up on unknown event names — it just logs them. This keeps the endpoint lenient while the shared constants define the known event vocabulary.

## Complexity & Trade-offs

This is intentionally thin. No Zod validation, no RLS context, no transaction. The trade-off: malformed event names slip through to the tracking layer. That's acceptable because analytics data is best-effort — dropping or misclassifying an event is far less harmful than slowing down the UI with synchronous validation.

## Patterns Worth Knowing

- **Fire-and-forget**: Calling an async function without `await`. The event gets tracked eventually, but the HTTP response doesn't depend on it. Common in analytics, logging, and notification systems.
- **Type assertion as documentation**: `eventName as AnalyticsEventName` documents the expected type without enforcing it at runtime. Useful when strictness would add latency for no user-facing benefit.

## Interview Questions

**Q: What happens if `trackEvent` throws?**
A: Since it's not awaited, the promise rejection becomes an unhandled rejection. In production, you'd want a `.catch()` or a global unhandled rejection handler (which Express 5 and Node both support). The event is lost, but the user's request already succeeded.

**Q: Why not validate `eventName` against the `ANALYTICS_EVENTS` constant?**
A: You could, but it adds coupling. If the frontend ships a new event name before the backend constant is updated, strict validation would reject valid events. The lenient approach lets the frontend iterate independently.

**Q: Why extract `orgId` and `userId` server-side instead of trusting the client?**
A: The client could lie. By reading from the JWT (which the auth middleware already verified), you guarantee the event is attributed to the actual authenticated user and org.

## Data Structures

Request body: `{ eventName: string, metadata?: Record<string, unknown> }`
Response: `{ data: { ok: true } }`

The `AnalyticsEventName` type is a string union from `shared/constants` — things like `'csv_uploaded'`, `'ai_summary_viewed'`, `'share_link_created'`.

## Impress the Interviewer

Notice that `trackEvent` is called without `await`. In most Express handlers, you'd want to await async operations so errors propagate to the error handler. Here, the deliberate non-await is a performance choice — analytics shouldn't add latency to the user's request. That's the kind of trade-off decision interviewers want to hear you articulate: "I chose speed over reliability here because lost analytics events are low-impact, but a slow UI is high-impact."
