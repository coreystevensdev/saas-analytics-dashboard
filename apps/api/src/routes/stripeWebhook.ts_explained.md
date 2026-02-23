# stripeWebhook.ts — Interview-Ready Documentation

## Elevator Pitch

A single-route Express router that receives Stripe webhook events, verifies their cryptographic signatures, and hands them off to the webhook handler. This is the entry point for all billing lifecycle changes — upgrades, cancellations, payment failures — flowing from Stripe into the application.

## Why This Approach

Stripe sends billing events to your server via POST requests. You *must* verify the webhook signature to confirm the event actually came from Stripe and wasn't spoofed. The signature verification requires the raw request body (not parsed JSON), which is why this route uses `express.raw()` as inline middleware instead of the global JSON body parser.

This is also why the Stripe webhook route must be mounted *before* the JSON body parser in the Express middleware chain. If the JSON parser runs first, it consumes the raw body, and signature verification fails. The CLAUDE.md middleware order rules enforce this.

## Code Walkthrough

The route handler does three things in order:

1. **Check for the signature header** — If `stripe-signature` is missing, return 400 immediately. No point trying to verify nothing.

2. **Verify and construct the event** — `getStripe().webhooks.constructEvent(req.body, sig, env.STRIPE_WEBHOOK_SECRET)` does the heavy lifting. It HMAC-verifies the raw body against the signature using the webhook secret. If verification fails, it throws, and we catch it, log a warning, and return 400.

3. **Delegate to the handler** — `handleWebhookEvent(event)` is a switch statement that dispatches to type-specific handlers (checkout completed, subscription updated, etc.). The route doesn't care which event type it is.

The response is always `{ received: true }` — Stripe's convention for acknowledging webhook delivery.

## Complexity & Trade-offs

This route is intentionally minimal. All business logic lives in `webhookHandler.ts`. The route's only job is signature verification and HTTP plumbing.

One subtlety: if `handleWebhookEvent` throws, Express 5's automatic promise rejection forwarding catches it and passes it to the error handler. The error handler returns a 500 to Stripe, which will retry the webhook. That's actually what you want — if your handler fails, Stripe retrying is your safety net.

## Patterns Worth Knowing

- **Raw body for signature verification**: Stripe (and many webhook providers) sign the exact bytes they send. If your server parses the body before verification, the re-serialized JSON might differ from the original (key ordering, whitespace). `express.raw()` preserves the original bytes.
- **Inline middleware**: `express.raw({ type: 'application/json' })` is applied to this single route, not globally. This avoids affecting other routes that need the global JSON parser.
- **Webhook idempotency**: Stripe may send the same event multiple times. This route doesn't handle deduplication — that responsibility falls to the handler layer (or is accepted as a trade-off if handlers are idempotent).

## Interview Questions

**Q: Why does this route need `express.raw()` instead of using the global JSON body parser?**
A: Stripe's webhook signature is computed over the raw request bytes. If the JSON parser runs first, `req.body` becomes a parsed object, and re-stringifying it may not produce identical bytes (different key order, different whitespace). The raw middleware preserves the exact bytes for signature verification.

**Q: What happens if Stripe sends the same event twice?**
A: The route processes it again. Stripe recommends making webhook handlers idempotent. In this codebase, the handler functions use `upsert` operations and status checks that are naturally idempotent — processing the same checkout completion twice results in the same database state.

**Q: Why return `{ received: true }` instead of the event processing result?**
A: Stripe only cares whether you received the event. If you return a non-2xx status, Stripe retries. The actual processing result is irrelevant to Stripe and shouldn't be leaked to external callers.

## Data Structures

- Incoming: Raw POST body (application/json bytes) + `stripe-signature` header
- After verification: `Stripe.Event` object with `type` and `data.object`
- Response: `{ received: true }`

## Impress the Interviewer

The middleware ordering constraint is the thing to highlight. This route *must* be mounted before `express.json()` in the middleware chain. If someone refactors the Express app setup and moves this route below the JSON parser, webhook verification silently breaks — the signature check fails on every request. That's why the project's CLAUDE.md explicitly documents the middleware order: correlationId → Stripe webhook → JSON parser → everything else. Architectural decisions that prevent silent failures are worth calling out.
