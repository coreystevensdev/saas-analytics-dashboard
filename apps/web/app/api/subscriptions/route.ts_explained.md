# route.ts — Subscriptions BFF Proxy

## Elevator Pitch

This is the BFF proxy for Stripe subscription management. It handles two concerns: a POST that routes to either Stripe Checkout or the Customer Portal based on a query parameter, and a GET that fetches the user's current subscription tier. The routing logic in the POST handler is the most interesting thing — one Next.js route maps to two different Express endpoints.

## Why This Approach

Stripe has two user-facing flows: Checkout (new subscription) and Portal (manage existing subscription). Rather than creating two separate Next.js route files, this route uses a query parameter (`?action=portal` vs. `?action=checkout`) to pick the Express endpoint. This keeps the frontend API surface small — one URL for all subscription actions.

The GET handler is separate because fetching the current tier is a read operation with different semantics (cacheable, no body, different Express endpoint).

## Code Walkthrough

### POST Handler

1. **Cookie and body extraction** — Standard pattern. Auth cookies forward to Express, body read as text to avoid parse-serialize overhead.

2. **Action-based routing** — `url.searchParams.get('action') ?? 'checkout'` reads the `action` query parameter. If it's `'portal'`, the request goes to `/subscriptions/portal`. Anything else (including missing) defaults to `/subscriptions/checkout`. This default is safe — checkout is the "create new" flow, portal is "manage existing."

3. **Endpoint construction** — A simple ternary picks between two Express paths. The rest of the fetch is standard proxy pattern.

### GET Handler

1. **Tier lookup** — Fetches the current subscription tier from `/subscriptions/tier`. The frontend uses this to gate features (AI summary length, export options) and show upgrade prompts.

2. **Cookie forwarding** — Auth required to look up your own subscription.

3. **Transparent status forwarding** — No error handling, no status remapping. If Express is down, the frontend shows a loading error.

## Complexity & Trade-offs

The action-based routing is a deliberate design choice. Alternatives:

- **Two route files** (`/api/subscriptions/checkout/route.ts` and `/api/subscriptions/portal/route.ts`) — more files, clearer mapping, but the frontend now needs to know about two URLs instead of one.
- **Different HTTP methods** — POST for checkout, PUT for portal. Semantically wrong (both create sessions), and overloads HTTP method semantics.
- **Body-based routing** — Put the action in the request body. Works, but query params are more visible in logs and easier to debug.

Query param routing is the pragmatic choice. It keeps the API surface small and the routing logic explicit (you can see both paths in one file).

The missing error handling on both handlers is a consistency gap. For subscription management (a revenue-critical flow), adding try/catch with `UPSTREAM_UNAVAILABLE` would be a good improvement.

## Patterns Worth Knowing

- **Query parameter routing** — Using a query param to select behavior within a single endpoint. Common in payment integrations where one resource (subscriptions) has multiple actions. Express does this internally too with its router, but the BFF collapses it to a single URL.
- **Dual-handler route files** — Next.js App Router lets you export multiple HTTP method handlers from one file. `export async function GET` and `export async function POST` in the same file is standard.
- **Annotating vs. blocking paywall** — The GET handler returns the tier, and the frontend uses it to *annotate* (show upgrade prompts, truncate AI summaries) rather than *block* (403 everything). Free users still get value, which drives conversion.

## Interview Questions

**Q: Why use a query parameter instead of separate routes?**
A: It keeps the frontend simple — one URL for all subscription mutations. The query param (`?action=portal` or `?action=checkout`) makes the intent explicit without multiplying route files. Both actions are POST requests to Stripe that return a redirect URL, so they share the same response shape.

**Q: What does the `?action=portal` flow do differently from checkout?**
A: Checkout creates a new Stripe Checkout Session for subscribing. Portal creates a Stripe Customer Portal Session for managing an existing subscription (cancel, change plan, update payment method). Different Stripe APIs, same proxy pattern.

**Q: Why does the GET return a "tier" instead of the full subscription object?**
A: The frontend only needs to know "free" vs "pro" to gate features. Exposing the full Stripe subscription object would leak pricing IDs, billing dates, and payment method info that the dashboard doesn't need. The Express endpoint transforms the Stripe data into a simple tier label.

**Q: What happens if a free user hits the portal endpoint?**
A: Express returns an error (no Stripe customer to create a portal session for). The proxy forwards that error. The frontend prevents this by only showing the "Manage subscription" button to paid users, but the backend validates regardless.

**Q: No error handling — is that a problem?**
A: For a portfolio project, it's a minor gap. In production, subscription management is revenue-critical. I'd add try/catch with structured 502 errors, and possibly retry logic for transient Stripe failures. The GET handler is less critical — a failed tier check means the frontend defaults to the free experience, which is a safe fallback.

## Data Structures

**POST request body** (for checkout):
```typescript
{ priceId: string, successUrl?: string, cancelUrl?: string }
```

**POST response** (both actions):
```typescript
{ data: { url: string } }  // Stripe redirect URL
```

**GET response**:
```typescript
{ data: { tier: 'free' | 'pro', expiresAt?: string } }
```

## Impress the Interviewer

The action-based routing is the conversation starter. Explain why one route with a query param beats two separate routes: same response shape, simpler frontend code, fewer files. Then pivot to the GET handler and explain the annotating-not-blocking paywall pattern — free users see truncated AI summaries with upgrade prompts instead of hitting a wall. That's a product decision encoded in the API design, and it's the kind of thing that shows you think about user experience at the API level, not just the UI level.
