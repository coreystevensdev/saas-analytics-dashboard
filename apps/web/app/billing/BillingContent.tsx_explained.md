# BillingContent.tsx — Interview-Ready Documentation

## Elevator Pitch

This is the billing management component — it shows what plan you're on (Free or Pro) and gives you a button to either upgrade or manage your subscription. It talks to Stripe through the BFF proxy, never directly. The component handles loading, error states, and the redirect-to-Stripe flow.

## Why This Approach

Billing UIs have a specific constraint: you don't manage subscriptions in your own app. Stripe Checkout and the Stripe Customer Portal handle the actual payment flows. Your job is to (1) show the current plan, (2) redirect to Stripe Checkout for upgrades, and (3) redirect to the Stripe Portal for subscription management.

This means the component is really a state machine with three states per action: idle, loading (waiting for the API to return a Stripe URL), and error. The "success" state is a browser redirect — the user leaves your app entirely.

The alternative would be embedding Stripe Elements for an in-app checkout experience. That's more work, more PCI compliance surface area, and more code to maintain. For an MVP, redirecting to Stripe's hosted pages is the right call.

## Code Walkthrough

```typescript
const { tier, isLoading } = useSubscription({ enabled: true });
```

`useSubscription` is a custom SWR-based hook that fetches the user's current subscription tier from the API. The `enabled` flag lets you skip the fetch conditionally (useful if you're not sure the user is authenticated).

```typescript
const handleCheckout = useCallback(async () => {
  setLoading(true);
  setError(null);
  try {
    const res = await fetch('/api/subscriptions?action=checkout', { method: 'POST' });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error?.message ?? 'Failed to start checkout');
      return;
    }
    window.location.href = json.data.checkoutUrl;
  } catch {
    setError('Something went wrong. Please try again.');
  } finally {
    setLoading(false);
  }
}, []);
```

A few things to notice:

- **`/api/subscriptions?action=checkout`** — This hits the Next.js BFF proxy, which forwards to Express. The browser never talks to Stripe directly. The `action` query param routes to different Stripe operations.
- **`window.location.href`** — Not `router.push()`. This is an intentional full-page navigation to an external domain (Stripe). `router.push()` is for internal Next.js routes.
- **`finally` always clears loading** — Even though a successful checkout redirects away, the `finally` block still runs. That's fine; the component might unmount before the state update applies, but React handles that gracefully.
- **Error shape follows API convention** — `json.error?.message` matches the standard `{ error: { code, message } }` response format used across the API.

`handlePortal` is structurally identical but hits `?action=portal` and gets back a `portalUrl`. The duplication is acceptable because these are two separate user intents with different copy, different API endpoints, and potentially different error handling in the future.

```typescript
if (isLoading) {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-32 rounded-lg bg-muted" />
    </div>
  );
}
```

Skeleton loading state — a pulsing gray rectangle that matches the approximate shape of the billing card. This prevents layout shift when the real content loads.

The render logic uses a conditional: free users see "Upgrade to Pro," pro users see "Manage Subscription." Both buttons disable during the API call and show "Redirecting..." text.

## Complexity & Trade-offs

Medium complexity. The main trade-off is between the current "two separate handlers" approach and extracting a shared `redirectToStripe(action)` function. The handlers are similar enough that you could abstract them, but different enough (different error messages, different response field names) that the abstraction would need parameters for everything. Two 15-line functions are clearer than one 20-line function with a config object.

Another trade-off: there's no optimistic UI. When you click "Upgrade to Pro," the button shows "Redirecting..." while waiting for the API. You could show a progress bar or animated transition, but the redirect typically happens in under a second, so the simple approach works.

The component doesn't handle edge cases like the user opening billing in two tabs or the subscription changing while viewing the page. SWR's built-in revalidation-on-focus covers the stale data case — when you come back from Stripe, the tab refocuses and SWR refetches the tier.

## Patterns Worth Knowing

- **BFF proxy pattern** — The browser calls `/api/subscriptions` (same origin), which forwards to Express. No CORS, no exposed API keys, no Stripe secret key in the browser.
- **Redirect-based external flow** — For Stripe (and similar services like OAuth providers), you create a session server-side, get a URL back, and redirect the browser. The external service handles the UX, then redirects back to your app.
- **`useCallback` with empty deps** — Both handlers have `[]` dependencies because they only use `setLoading`, `setError`, and `fetch` — all stable references. This prevents unnecessary re-renders of child components if these handlers were passed as props.
- **Skeleton loading** — `animate-pulse` on a gray div that approximates the final layout. Quick to build, prevents CLS (Cumulative Layout Shift).

## Interview Questions

**Q: Why use `window.location.href` instead of Next.js router for the Stripe redirect?**
A: `router.push()` handles client-side navigation within the Next.js app. Stripe Checkout and the Customer Portal are external URLs on `checkout.stripe.com`. You need a full browser navigation, not a client-side route change. `window.location.href` triggers that.

**Q: What happens if the user clicks "Upgrade" and then closes the tab before reaching Stripe?**
A: Nothing harmful. The API created a Stripe Checkout Session, but sessions expire after 24 hours if not completed. No charge occurs. The `setLoading(false)` in the `finally` block would run if the component were still mounted, but since the tab is closing, it doesn't matter. No resources leak.

**Q: Why not use a form with a server action instead of `fetch`?**
A: You could. A server action would call the API, get the Stripe URL, and use `redirect()` to send the user there. The current approach uses client-side fetch because it allows showing the loading/error states inline without a full-page navigation cycle. Both are valid; this one gives more control over the UX during the redirect delay.

**Q: How does the component know the subscription tier is fresh when returning from Stripe?**
A: SWR revalidates on window focus. When the user completes checkout on Stripe and returns to this page (or any page using `useSubscription`), the browser tab regains focus, SWR automatically refetches the tier, and the UI updates. No manual cache invalidation needed.

## Data Structures

The component works with:

- **`tier: 'free' | 'pro'`** — From `useSubscription`. Determines which button to show.
- **Checkout response**: `{ data: { checkoutUrl: string } }` — URL for Stripe Checkout.
- **Portal response**: `{ data: { portalUrl: string } }` — URL for Stripe Customer Portal.
- **Error response**: `{ error: { code: string, message: string } }` — Standard API error format.

## Impress the Interviewer

Talk about the paywall strategy. This project uses an "annotating, not blocking" approach to the free tier. Free users still see AI summaries — they're just truncated to ~150 words with a blur effect. The billing page is the conversion point, but the product doesn't hold features hostage. That's a deliberate growth decision: let users see the value before asking them to pay.

Also point out the SWR revalidation-on-focus behavior. It's one of those things that "just works" but only because the data fetching library was chosen with this use case in mind. Without it, you'd need a webhook handler, a return URL with a status param, or some other mechanism to know the subscription changed.
