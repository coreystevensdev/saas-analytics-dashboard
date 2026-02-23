# subscriptions.ts — Interview-Ready Documentation

## Elevator Pitch

Three Zod schemas for the Stripe billing integration: Checkout session URLs, Customer Portal session URLs, and subscription status. These define the API response shapes for creating checkout sessions, opening the billing portal, and checking the current tier. Small file, big impact — this is the type contract that gates AI features behind the paywall.

## Why This Approach

Same pattern as the other shared schemas: define once in `packages/shared`, import everywhere. The billing feature has three API interactions (create checkout, open portal, check status), and each gets a focused schema rather than one giant billing object. This keeps each endpoint's contract clear and independently testable.

## Code Walkthrough

- **`checkoutSessionSchema`** — wraps a single `checkoutUrl` (validated as a URL). The frontend redirects to this URL to start the Stripe Checkout flow.
- **`portalSessionSchema`** — same shape but for the Stripe Customer Portal, where users manage their subscription. Separate schema because the two URLs come from different Stripe API calls and go to different destinations.
- **`subscriptionStatusSchema`** — `tier: 'free' | 'pro'`. This is the minimum the frontend needs to decide whether to show the full AI summary or the truncated preview with an upgrade prompt.

## Complexity & Trade-offs

Extremely low complexity. The schemas are intentionally thin — they validate the shape the frontend needs, not the full Stripe response. The API translates Stripe's verbose response into this minimal shape before sending it.

## Patterns Worth Knowing

**Response schemas as API contracts** — each schema defines exactly what the frontend can expect from an endpoint. If a backend developer accidentally removes a field, Zod validation (or TypeScript compilation) catches it before it reaches production.

## Interview Questions

**Q: Why is the subscription status just `free` or `pro`, not the full Stripe subscription object?**
A: The frontend doesn't need Stripe's 50+ fields. It needs one bit of information: can this user access AI features? Exposing minimal data reduces the API surface and avoids leaking Stripe implementation details to the client.

**Q: Why separate schemas for checkout and portal instead of a generic "session URL" schema?**
A: They're semantically different operations — one starts a purchase, the other manages an existing subscription. Separate schemas make the code self-documenting and allow each to evolve independently (portal might need additional fields later).

## Data Structures

- `CheckoutSession` — `{ checkoutUrl: string }`
- `PortalSession` — `{ portalUrl: string }`
- `SubscriptionStatus` — `{ tier: 'free' | 'pro' }`

## Impress the Interviewer

The `tier` enum being just two values (`free`/`pro`) is a product decision, not a technical limitation. The architecture document specifies an "annotating, not blocking" paywall — free users still get AI features, just truncated. So the frontend doesn't need `trial`, `past_due`, `canceled`, etc. — it only needs to know whether to show the full summary or the preview. If you mention this in an interview, it shows you understand that schema design is driven by product requirements, not by mirroring the third-party API.
