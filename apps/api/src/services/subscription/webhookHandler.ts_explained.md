# webhookHandler.ts — Interview-Ready Documentation

## Elevator Pitch

A state machine for Stripe subscription lifecycle events. Handles checkout completion (free → pro), subscription updates (cancellation, reactivation, payment failure), invoice failures, and subscription deletion (expiry). Each event type maps to a handler that updates the local subscription record and fires an analytics event. This is the "inbound" half of billing — Stripe tells you what happened, and you update your database accordingly.

## Why This Approach

Stripe is the source of truth for billing state. Your application database is a local replica of that state, updated asynchronously via webhooks. This inverted control flow — Stripe pushes events to you rather than you polling Stripe — is the standard pattern for payment integrations.

Each webhook event type gets its own handler function. The alternative (one big handler with lots of `if` branches) would work but gets unreadable fast. Separate functions make it easy to reason about each lifecycle transition independently and to test them in isolation.

## Code Walkthrough

**`handleWebhookEvent(event)`** — A switch statement that dispatches to type-specific handlers. Unknown event types get logged and ignored. This is intentional — Stripe sends many event types, and you only handle the ones you care about.

**`handleCheckoutCompleted(session)`**:
- Extracts `orgId` and `userId` from the session metadata (attached during checkout session creation in `stripeService.ts`).
- Extracts the Stripe customer ID and subscription ID, handling the fact that Stripe sometimes sends these as strings and sometimes as expanded objects.
- Validates that all required fields exist. If anything's missing, logs an error and returns (doesn't throw — you don't want to trigger Stripe retries for data you'll never have).
- Upserts the subscription record: creates it if new, updates it if the org previously had a subscription.
- Fires a `SUBSCRIPTION_UPGRADED` analytics event.

**`handleSubscriptionUpdated(subscription)`**:
- The most complex handler because `subscription.updated` fires for many reasons: cancellation scheduling, reactivation, payment status changes, period renewals.
- Always updates the period end date first (keeping the date fresh regardless of why the event fired).
- Then branches on the subscription state: `cancel_at_period_end` → mark canceled; `active` → mark reactivated; `past_due` → mark past_due.
- For cancellation, finds the org owner to attribute the analytics event. Falls back gracefully if no owner is found (logs a warning, doesn't throw).

**`handleInvoicePaymentFailed(invoice)`**:
- Handles the `InvoiceWebhookPayload` type, which can have `subscription` as a string or an expanded object.
- Looks up the subscription by Stripe ID to get the `orgId`.
- Marks the subscription as `past_due`.
- Fires analytics, again with graceful fallback if no org owner is found.

**`handleSubscriptionDeleted(subscription)`**:
- Fires when Stripe permanently deletes the subscription (after the cancellation period ends).
- Marks the subscription as `expired`.
- The simplest handler — no conditional logic, just a status update + analytics.

All handlers use `dbAdmin` because webhook processing has no authenticated user context. There's no JWT, no session — Stripe calls your endpoint directly.

## Complexity & Trade-offs

**Out-of-order webhooks**: Stripe doesn't guarantee event ordering. `handleSubscriptionUpdated` checks `rowsUpdated === 0` to detect when an update arrives before the checkout completion. It logs a warning but doesn't crash — the checkout webhook will eventually arrive and create the subscription row.

**Metadata dependency**: Every handler relies on `metadata.orgId`. If the checkout session was created without metadata (a bug in `stripeService.ts`), the webhook handler can't process events. The early-return-with-error-log pattern handles this gracefully but silently — the subscription won't be activated, and you'll need to reconcile manually.

**Analytics event attribution**: Webhook events don't have a user context, so the handlers look up the org owner to attribute analytics events. This is a workaround — ideally, analytics events would have a "system" actor for webhook-triggered changes.

**Double-counting prevention**: The `handleSubscriptionUpdated` handler deliberately skips analytics for `past_due` status because `handleInvoicePaymentFailed` already fires that event. The comment calls this out — it's the kind of subtle logic that causes analytics inflation if you're not careful.

## Patterns Worth Knowing

- **Event-driven state machine**: Each Stripe event maps to a state transition (free→pro, pro→canceled, canceled→active, active→past_due, past_due→expired). In an interview, draw this as a state diagram.
- **Idempotent handlers**: `upsertSubscription` and `updateSubscriptionStatus` are idempotent — processing the same event twice produces the same database state. This matters because Stripe retries failed webhooks.
- **Graceful degradation on missing data**: Every handler validates its inputs and returns early (with logging) rather than throwing. This prevents Stripe from retrying events that will never succeed.
- **Type narrowing for polymorphic payloads**: Stripe sends `customer` as `string | Stripe.Customer | null`. The handlers narrow this with `typeof === 'string'` checks. The `SubscriptionWebhookPayload` and `InvoiceWebhookPayload` custom types handle SDK version differences.

## Interview Questions

**Q: How do you handle out-of-order Stripe webhooks?**
A: The handlers are written to tolerate missing state. If `subscription.updated` arrives before `checkout.session.completed`, the update finds no matching row (`rowsUpdated === 0`), logs a warning, and returns. When the checkout event eventually arrives, it creates the row with the correct state. The system converges to correctness even with reordering.

**Q: What happens if the webhook handler throws an uncaught error?**
A: Express 5 forwards the promise rejection to the error handler, which returns a 500 to Stripe. Stripe interprets this as a delivery failure and retries with exponential backoff (up to 3 days). This is actually desirable for transient errors (database connection blip) — the retry will succeed. For permanent errors, the early-return pattern prevents pointless retries.

**Q: Why use `dbAdmin` instead of the regular `db` connection?**
A: Webhooks don't have an authenticated user, so there's no JWT to extract an `orgId` from. The RLS-scoped `db` connection requires a `SET app.current_org_id` before queries work. `dbAdmin` bypasses RLS entirely, which is correct here because the webhook handler is already scoped by the Stripe metadata.

**Q: How do you prevent the same checkout from creating duplicate subscription rows?**
A: `upsertSubscription` uses an INSERT ... ON CONFLICT pattern. If a subscription row already exists for the org, it updates instead of inserting. This makes the handler idempotent — processing the same `checkout.session.completed` event twice produces one row, not two.

**Q: Why fire analytics events in webhook handlers instead of the frontend?**
A: The frontend doesn't know when billing state changes. The user clicks "Subscribe," gets redirected to Stripe, and returns to the app. The actual subscription activation happens asynchronously via webhook. Analytics events need to capture the moment the state actually changed, not the moment the user initiated the flow.

## Data Structures

```typescript
// Stripe SDK v20 quirk — current_period_end is on the subscription
// at the webhook level but moved to SubscriptionItem in the SDK types
type SubscriptionWebhookPayload = Stripe.Subscription & {
  current_period_end: number;
};

// Invoice subscription field is polymorphic
type InvoiceWebhookPayload = Stripe.Invoice & {
  subscription: string | { id: string } | null;
};

// Subscription states in the local database
type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'expired';
```

State transitions:
```
(none) → active           (checkout.session.completed)
active → canceled         (subscription.updated + cancel_at_period_end)
canceled → active         (subscription.updated + status 'active')
active → past_due         (invoice.payment_failed)
canceled → expired        (customer.subscription.deleted)
past_due → expired        (customer.subscription.deleted)
```

## Impress the Interviewer

The double-counting prevention between `handleSubscriptionUpdated` and `handleInvoicePaymentFailed` is subtle and worth calling out. When a payment fails, Stripe sends *both* `invoice.payment_failed` and `subscription.updated` (with status `past_due`). If both handlers fire `SUBSCRIPTION_PAYMENT_FAILED`, your analytics show twice as many failures as actually occurred. The code deliberately omits the analytics event in the `past_due` branch of `handleSubscriptionUpdated`, with a comment explaining why. That kind of attention to event semantics is what separates production-grade webhook handling from tutorial-level code.
