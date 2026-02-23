# page.tsx (Root) — Interview-Ready Documentation

## Elevator Pitch

The root page (`/`) immediately redirects to `/dashboard`. There's no homepage — the dashboard *is* the product landing experience. This is a five-line file, and that's the whole point.

## Why This Approach

The dashboard is intentionally public in this project. Anonymous visitors see seed data with a pre-cached AI summary — that's the "aha moment" that converts them. A separate marketing homepage would add a click between the user and the product. So `/` just sends you straight there.

The `redirect()` function from Next.js performs a server-side redirect (HTTP 307). The browser never renders this component — it gets the redirect response and navigates before any HTML loads.

An alternative would be a `rewrite` in `next.config.js` or handling this in `proxy.ts` (Next.js 16's middleware equivalent). But a page-level redirect is the most visible and debuggable approach. A future developer looking at `app/page.tsx` immediately understands what happens at `/`.

## Code Walkthrough

```typescript
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/dashboard');
}
```

That's the whole file. `redirect()` throws a special Next.js error internally (it's not a return value — it interrupts rendering). The framework catches it and sends the appropriate HTTP response. You don't need a `return` statement after it.

## Complexity & Trade-offs

Zero complexity. The trade-off is that you can't A/B test a landing page vs. direct-to-dashboard without changing this file. But that's a problem for when the product actually needs a marketing page.

## Patterns Worth Knowing

- **Server-side redirect in App Router** — `redirect()` works in Server Components, Route Handlers, and Server Actions. It throws internally, so code after it is unreachable. In Client Components, you'd use `useRouter().push()` instead.

## Interview Questions

**Q: Why use `redirect()` instead of configuring this in middleware or next.config.js?**
A: All three work. The page-level redirect is the most explicit — you open the file and immediately see what `/` does. Config-level redirects are better for bulk URL migrations. Middleware redirects are for conditional logic (auth checks, geo-routing). For a single unconditional redirect, the page file is the right level of abstraction.

**Q: What HTTP status code does this produce?**
A: 307 (Temporary Redirect) by default. You can pass a second argument to `redirect()` to specify 301 (permanent) if you want search engines to index the target URL directly. 307 is correct here because the redirect is an implementation detail, not a URL migration.

## Data Structures

None.

## Impress the Interviewer

The interesting thing isn't the code — it's the product decision. The dashboard is public because the best conversion funnel is showing someone the actual product with real-looking data. No signup wall, no "see a demo" button. You land on the dashboard, see AI-generated business insights, and think "I want this for my data." That's a design philosophy baked into a five-line file.
