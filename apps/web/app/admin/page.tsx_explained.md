# page.tsx — Interview-Ready Documentation

## Elevator Pitch

The main admin dashboard page — a server component that fetches org and user data in parallel, renders three stat cards (total orgs, total users, pro subscribers), mounts the self-polling health panel, and passes data down to the org and user tables. It's the composition root for the entire admin overview.

## Why This Approach

This page uses the server component data-fetching pattern: fetch on the server, render HTML, send it to the client. No loading spinners for the initial paint — the data is already in the HTML when it arrives. The `loading.tsx` skeleton covers the server fetch time via Suspense.

Two design decisions stand out:

1. **Parallel fetching with `Promise.all`**: Orgs and users are independent API calls. Fetching them in sequence would double the wait time. `Promise.all` fires both requests simultaneously and waits for the slower one.

2. **Server component → client component data flow**: The page fetches data, then passes it as props to `AdminOrgTable` and `AdminUserTable` (client components). This means the tables ship no data-fetching code to the browser. The only client-side fetching is in `SystemHealthPanel`, which needs periodic polling.

## Code Walkthrough

**`fetchAdminOrgs(cookieHeader)`**: Calls `/admin/orgs` via the `apiServer` helper (which handles the BFF proxy to Express). The response includes both the org array (`res.data`) and stats in the metadata (`res.meta.stats`). This is a single API call that returns both the table data and the summary numbers — no second request needed for the stat cards.

**`fetchAdminUsers(cookieHeader)`**: Simpler — just returns the user array.

**Cookie forwarding**: The server component reads the access token cookie and forwards the full cookie string to `apiServer`. This is the BFF pattern at work: the browser never calls Express directly. The Next.js server acts as the proxy, forwarding auth credentials.

**Stat cards**: Three cards in a responsive grid (`md:grid-cols-3`). Each card has:
- An icon from Lucide (`Building2`, `Users`, `CreditCard`) marked `aria-hidden` — they're decorative.
- The stat number with `fontFeatureSettings: '"tnum"'` for tabular digit alignment.
- An `aria-label` on the number that provides context for screen readers (e.g., "42 organizations" instead of just "42").
- The containing grid has `role="group"` and `aria-label="Platform statistics"` for screen reader navigation.

**Component composition**: After the stat cards, the page renders `SystemHealthPanel` (self-contained, fetches its own data) and then `AdminOrgTable` and `AdminUserTable` (receive data as props).

## Complexity & Trade-offs

**Gained**: Fast initial load with zero client-side data fetching for the main content. The page is fully rendered HTML when it arrives, which means good SEO (not that admin pages need it) and fast Largest Contentful Paint.

**Sacrificed**: The data is static after initial load. If another admin adds an org while you're viewing the page, you won't see it until you refresh. This is fine for an admin overview — it's a snapshot, not a live feed. The health panel is the exception, with its 30-second poll.

**Stats piggyback on the orgs endpoint**: The `meta.stats` trick means one fewer API call. The trade-off is coupling — if you wanted stats without the full org list, you'd need a separate endpoint.

**No error handling in fetchers**: If `fetchAdminOrgs` throws, the error propagates to `error.tsx`. The fetchers don't try-catch because there's nothing useful to do at that level — the error boundary handles the display.

## Patterns Worth Knowing

- **Parallel server-side fetching**: `Promise.all([fetchA(), fetchB()])` in a server component. Straightforward but easy to forget — sequential `await`s are a common performance mistake.
- **BFF cookie forwarding**: The server component reads cookies from the request and passes them to the API helper, which includes them in the backend request. The browser never talks to Express directly.
- **Stats in metadata**: Instead of a separate `/admin/stats` endpoint, the stats ride along in the `meta` field of the orgs response. One request, two purposes.
- **Aria patterns for data cards**: `role="group"` on the container, `aria-label` on individual numbers to give screen readers context. A screen reader user hears "42 organizations" instead of just "42."

## Interview Questions

**Q: Why fetch data in the server component instead of using SWR or React Query?**
A: Server-side fetching means the data is in the HTML on first paint — no loading state, no client-side JavaScript for fetching. The trade-off is the data is static (no real-time updates), which is acceptable for an admin overview. The health panel uses SWR because it needs periodic refresh.

**Q: Why does `Promise.all` matter here?**
A: Without it, the two API calls would be sequential: fetch orgs (say 200ms), then fetch users (say 150ms) = 350ms total. With `Promise.all`, they run in parallel: max(200ms, 150ms) = 200ms. For two calls the savings are modest, but the pattern matters — sequential server-side fetches are a common performance bottleneck that compounds as you add more data sources.

**Q: What happens if one of the parallel fetches fails?**
A: `Promise.all` rejects as soon as any promise rejects. The error propagates to `error.tsx`, which shows the retry UI. If you wanted partial data (show users even if orgs fail), you'd use `Promise.allSettled` and handle each result individually.

**Q: How does the cookie forwarding work in the BFF pattern?**
A: The browser sends the httpOnly access token cookie with every request to the Next.js server (same origin). The server component reads it via `cookies()`, converts it to a string, and passes it in the `cookies` option of `apiServer()`, which sets it as a `Cookie` header on the request to Express (port 3001). Express sees the same auth cookie as if the browser called it directly.

**Q: Why use `fontFeatureSettings` instead of a monospace font for the stat numbers?**
A: `tnum` (tabular numbers) makes digits fixed-width while keeping the rest of the font proportional. The numbers look native to the design system's font (likely Inter or system font) rather than jarring monospace. It's the professional approach to number alignment.

## Data Structures

```
API response for /admin/orgs:
{
  data: AdminOrgRow[],
  meta: { stats: AdminStats }
}

AdminStats: { totalOrgs, totalUsers, proSubscribers }

API response for /admin/users:
{
  data: AdminUserRow[]
}
```

The page destructures the orgs response into `{ orgs, stats }` and passes each piece to the right consumer — stats to the cards, orgs to the table.

## Impress the Interviewer

The architecture decision that makes this page fast is the combination of three patterns: (1) server-side rendering eliminates the client fetch waterfall, (2) `Promise.all` parallelizes the server fetches, and (3) stats piggyback on the orgs response to cut a network round-trip. Together, the page needs exactly two parallel API calls to render everything. In a client-side-only approach, you'd have three sequential waterfalls: page JS loads → auth check → data fetch. Here, all of that collapses into server render time. If an interviewer asks "how do you optimize data loading in Next.js," this page is a concrete example with three distinct techniques working together.
