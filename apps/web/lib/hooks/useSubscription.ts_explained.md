# useSubscription — Interview-Ready Documentation

## Elevator Pitch

A hook that fetches the current user's subscription tier (free or pro) and exposes it as a simple `{ tier, isPro, isLoading }` object. It wraps SWR for caching and revalidation, with one deliberate tweak: it revalidates on window focus (catching Stripe Checkout returns) but *not* on network reconnect (avoiding noise on flaky connections).

## Why This Approach

Subscription state is read frequently (gating AI features, showing upgrade prompts, controlling word limits) but changes rarely (only after a Checkout session or portal action). SWR's stale-while-revalidate strategy is a natural fit: serve the cached tier instantly, revalidate in the background. The hook abstracts away the fetching, parsing, and error handling so components just ask "is this user pro?"

An alternative would be storing the tier in a React context after login, but that goes stale if the user upgrades in another tab or completes a Stripe Checkout flow that redirects back. SWR's focus revalidation handles that case automatically.

## Code Walkthrough

- **`fetchTier`**: A custom SWR fetcher. If the response isn't OK (401, 500, whatever), it returns `'free'` instead of throwing. This means the hook degrades gracefully — an auth failure or server error just means "treat them as free tier." No error toasts, no broken UI.
- **`enabled` option**: When `false`, the SWR key is `null`, which tells SWR to skip the request entirely. Useful for pages where subscription state is irrelevant (public share page, login flow).
- **`fallbackData`**: SWR's built-in way to provide initial data. If the server component already knows the tier (from a cookie or server-side check), it can pass it down to avoid a loading flash.
- **`revalidateOnReconnect: false`**: The one SWR default this hook overrides. Reconnect events fire whenever a flaky WiFi connection drops and recovers — on mobile, that can be every few minutes. The tier doesn't change that frequently, so the revalidation is wasted work. Focus revalidation (`revalidateOnFocus`, left as default `true`) is the right trigger — it fires when the user returns from Stripe Checkout.
- **`isPro` derived value**: A convenience boolean. Components say `if (isPro)` instead of `if (tier === 'pro')`. Small thing, but it makes conditionals read better.
- **`mutate` wrapper**: SWR's `mutate` returns the updated data, but callers of this hook don't need it. The wrapper turns it into a simple `async () => void` to keep the API clean.

## Complexity & Trade-offs

Low-medium complexity. The interesting decisions:

- **Silent degradation to `'free'`**: If the subscription endpoint is down, users see the free experience. They might miss pro features temporarily, but nothing breaks. The alternative — showing an error state — is worse UX for a background data fetch.
- **No error state in the return type**: This is a deliberate omission. Since failures degrade to `'free'`, there's no error the consumer needs to handle. If you needed to show "subscription check failed," you'd add it. But the product decision here is: free tier is the safe fallback.
- **SWR cache sharing**: If multiple components call `useSubscription`, SWR deduplicates the request. They all share the same cached value and the same revalidation cycle. This is free with SWR — no extra code needed.

## Patterns Worth Knowing

- **SWR conditional fetching**: Passing `null` as the key disables the request. This is SWR's version of React Query's `enabled` option. You'll see it everywhere in apps that conditionally fetch data.
- **Fetcher-level error handling**: Instead of letting SWR's `error` state propagate to the UI, this fetcher catches errors and returns a fallback value. This pattern works when you have a sensible default (like `'free'`) and don't need to show error UI.
- **Focus revalidation for payment flows**: When a user completes Stripe Checkout, they're redirected back to your app. The tab regains focus, SWR fires a revalidation, and the new subscription tier is fetched. No manual "check subscription after redirect" logic needed.

## Interview Questions

**Q: Why does `fetchTier` return `'free'` on error instead of throwing?**
A: Product decision. If the subscription service is unreachable, showing the free experience is better than showing an error screen. The user can still use the dashboard — they just don't get pro features until the next successful revalidation.

**Q: How does the hook handle Stripe Checkout completion?**
A: Stripe redirects the user back to the app after checkout. When the browser tab regains focus, SWR's `revalidateOnFocus` (default `true`) fires a background refetch. The tier updates from `'free'` to `'pro'` without any explicit "check subscription" call.

**Q: Why disable `revalidateOnReconnect` but keep `revalidateOnFocus`?**
A: They serve different purposes. Focus events are deliberate — the user left and came back (possibly from Stripe). Reconnect events are involuntary — the WiFi dropped for a second. Subscription tier doesn't change on WiFi drops, so the reconnect revalidation is wasted bandwidth and server load.

**Q: What if two components both call `useSubscription`?**
A: SWR deduplicates requests by cache key. Both components share the same `/api/subscriptions` entry. Only one network request fires, and both components get the same data. This is built into SWR — no extra configuration.

**Q: How would you test this hook?**
A: Use `renderHook` with an SWR config provider that disables caching between tests (`dedupingInterval: 0`). Mock `fetch` to return different tiers. Assert that `tier` and `isPro` reflect the response. Test the `enabled: false` case by asserting `fetch` was never called. Test error handling by making `fetch` reject and asserting `tier` defaults to `'free'`.

## Data Structures

```typescript
// From shared/types
type SubscriptionTier = 'free' | 'pro';

interface UseSubscriptionOptions {
  enabled?: boolean;           // default true — set false to skip fetch
  fallbackData?: SubscriptionTier;  // initial data to avoid loading flash
}

interface UseSubscriptionResult {
  tier: SubscriptionTier;      // current tier, defaults to 'free'
  isPro: boolean;              // convenience: tier === 'pro'
  isLoading: boolean;          // true during initial fetch (not revalidation)
  mutate: () => Promise<void>; // manually trigger revalidation
}
```

## Impress the Interviewer

The insight worth calling out: **this hook has no error state by design.** That's not laziness — it's a product decision baked into the code. Most hooks expose `{ data, error, isLoading }`. This one exposes `{ tier, isPro, isLoading }`. The absence of `error` tells you that the team decided subscription failures should be invisible to the user. That kind of intentional API surface — where what you *omit* matters as much as what you include — shows mature thinking about the boundary between product decisions and technical implementation.
