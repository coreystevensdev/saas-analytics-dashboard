# stripeService.ts — Interview-Ready Documentation

## Elevator Pitch

The Stripe integration layer — creates checkout sessions for upgrades and billing portal sessions for subscription management. Uses a lazy-initialized Stripe client singleton and wraps all Stripe API calls with structured error handling. This is the "outbound" half of billing; the "inbound" half is the webhook handler.

## Why This Approach

Stripe's checkout flow is redirect-based: your server creates a session, gets back a URL, and redirects the user to Stripe's hosted page. This means the server never touches credit card numbers, PCI scope stays minimal, and the UI is Stripe's responsibility. The server's job is just session creation and metadata attachment.

Lazy initialization of the Stripe client (`_stripe`) avoids instantiating it at import time. This matters for testing (you can mock `env.STRIPE_SECRET_KEY` before the first call) and for startup performance (the Stripe SDK doesn't load until it's needed).

## Code Walkthrough

**`getStripe()`** — Lazy singleton. Creates the Stripe client on first call, reuses it after. The `maxNetworkRetries: 2` option tells the Stripe SDK to retry failed requests twice before giving up. This handles transient network issues without application-level retry logic.

**`createCheckoutSession(orgId, userId, client)`**:

1. Checks if the org already has a subscription with a Stripe customer ID. If so, passes it to the checkout session so Stripe links the new subscription to the existing customer (no duplicate customers).
2. Creates a Stripe checkout session with the price ID from config, success/cancel URLs, and metadata (`orgId`, `userId`). That metadata flows back through the webhook when checkout completes — it's how the webhook handler knows which org to upgrade.
3. Returns the checkout URL for the frontend to redirect to.
4. Wraps the Stripe call in try/catch with `ExternalServiceError` — a typed error that the global handler formats consistently.

**`createPortalSession(stripeCustomerId)`** — Simpler version: creates a billing portal session so existing customers can manage their subscription (cancel, update payment method, view invoices). Returns the portal URL.

Both functions log success and failure with structured Pino logging, including relevant IDs for debugging.

## Complexity & Trade-offs

**Metadata as the glue**: The `metadata: { orgId, userId }` on the checkout session is how billing events get correlated back to the application's data model. If this metadata is missing or wrong, the webhook handler can't process the event. That's a fragile coupling — but it's Stripe's recommended pattern.

**Customer reuse**: The `customerParam` spread avoids creating duplicate Stripe customers when a user who previously had a subscription re-subscribes. Without this, Stripe would create a new customer each time, making billing history fragmented.

**No idempotency keys**: The Stripe SDK supports idempotency keys for safe retries, but this code doesn't use them. For checkout session creation, it's acceptable — creating two sessions just means the user gets two URLs, and only one can be completed. For a production system with higher traffic, you'd add idempotency keys.

## Patterns Worth Knowing

- **Lazy singleton**: `let _stripe = null; function getStripe() { if (!_stripe) _stripe = new Stripe(...); return _stripe; }`. Common for SDK clients that are expensive to initialize or need configuration that isn't available at import time.
- **Metadata round-tripping**: Attach application IDs to Stripe objects, read them back in webhooks. This decouples the checkout flow (user-initiated, synchronous) from the fulfillment flow (webhook-driven, asynchronous).
- **External service error wrapping**: Catching Stripe errors and rethrowing as `ExternalServiceError` normalizes the error format. The global error handler doesn't need to know about Stripe-specific error shapes.

## Interview Questions

**Q: Why lazy-initialize the Stripe client instead of creating it at module load?**
A: Two reasons. First, the `env.STRIPE_SECRET_KEY` might not be available at import time in test environments. Lazy init lets tests set up mocks before the client is created. Second, if the Stripe SDK is never used in a particular code path (e.g., a health check request), it's never loaded — no wasted memory or initialization time.

**Q: What happens if the user completes checkout but the webhook never arrives?**
A: The user's subscription isn't activated in the application database. Stripe has webhook retry logic (exponential backoff over 3 days), so transient failures recover automatically. For persistent failures, you'd need a reconciliation job that polls the Stripe API for completed sessions. This is a known gap in most webhook-driven architectures.

**Q: Why pass `orgId` and `userId` as metadata instead of using the webhook payload?**
A: The checkout session payload includes a Stripe customer ID and subscription ID, but those are Stripe's identifiers. The application needs to map them back to its own org and user IDs. Metadata is the bridge — you attach your IDs at session creation, and they come back in the webhook event.

**Q: Why is `getStripe` exported?**
A: The webhook route needs the Stripe instance for signature verification (`getStripe().webhooks.constructEvent`). Re-exporting it from this module keeps the Stripe client creation in one place.

## Data Structures

```typescript
// createCheckoutSession returns
{ checkoutUrl: string | null }

// createPortalSession returns
{ portalUrl: string }

// Stripe session metadata (attached at creation, read in webhook)
{ orgId: string, userId: string }  // strings because Stripe metadata is string-only
```

## Impress the Interviewer

The `customerParam` spread is a small detail with big implications. Without it, a user who cancels and re-subscribes gets a new Stripe customer, which means split billing history, potential duplicate charges during edge cases, and a confusing Stripe dashboard. With it, the existing customer is reused, and Stripe's billing portal shows the full history. It's a one-liner that prevents a whole category of support tickets. Interviewers love hearing about these "unsexy but high-impact" details.
