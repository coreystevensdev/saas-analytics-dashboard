# dashboard/page.tsx — Interview-Ready Documentation

## Elevator Pitch

The main dashboard page. It's a Server Component that fetches chart data, a cached AI summary, and the user's subscription tier — all on the server before any HTML reaches the browser. It passes everything to `DashboardShell`, a Client Component that handles the interactive experience (streaming AI, chart interactions, sharing). The page handles two distinct user types: anonymous visitors who get pre-cached seed summaries, and authenticated users who get tier-gated live AI.

## Why This Approach

The dashboard has a cold-start problem: the first render needs chart data, and ideally an AI summary, before the page is useful. Fetching this on the server means the browser receives a fully rendered dashboard — no loading spinners, no layout shift, no waterfall of client-side requests.

The data fetching strategy splits by auth state:

- **Anonymous visitors** — Get seed data (demo charts) and a pre-cached AI summary. No streaming, no tier check. The cached summary is the "aha moment" — visitors see what the product does without signing up.
- **Authenticated users** — Get their real chart data and subscription tier. The AI summary isn't fetched here; `DashboardShell` handles on-demand streaming, which requires client-side SSE.

This split is a product decision encoded as a data-fetching strategy. Anonymous users get the fastest possible time-to-content (server-rendered, no JS needed for the initial view). Authenticated users get real-time AI streaming (requires JS, but they're already invested).

## Code Walkthrough

### Cookie forwarding

```typescript
const cookieStore = await cookies();
const cookieHeader = cookieStore
  .getAll()
  .map((c) => `${c.name}=${c.value}`)
  .join('; ');
```

Server Components run on the Node.js server, but the API also runs on a server (Express on port 3001). To make authenticated API calls from the Next.js server to the Express server, you need to forward the browser's cookies. `cookies()` gives you the incoming request's cookies, and you reassemble them into a `Cookie` header string for outbound requests. This is the BFF (Backend for Frontend) pattern — Next.js acts as an intermediary.

### Chart data fetch with fallback

```typescript
let chartData: ChartData;
try {
  const res = await apiServer<ChartData>('/dashboard/charts', {
    cookies: cookieHeader,
  });
  chartData = res.data;
} catch (err) {
  if (err instanceof ApiServerError) {
    chartData = EMPTY_CHART_DATA;
  } else {
    throw err;
  }
}
```

Two error paths: `ApiServerError` (the API responded with an error status) falls back to empty chart data — the dashboard renders but with nothing to show. Other errors (network failures, DNS issues) bubble up and hit Next.js's error boundary. This distinction matters: a 404 from the API means "no data yet," which is a valid state. A network error means something is broken.

`EMPTY_CHART_DATA` is a well-typed constant with sensible defaults — `isDemo: true`, `demoState: 'empty'`, empty arrays for chart series.

### Conditional data fetching

```typescript
if (!hasAuth && chartData.datasetId) {
  const cached = await fetchCachedSummary(chartData.datasetId);
  cachedSummary = cached?.content;
  cachedMetadata = cached?.metadata ?? null;
}

const tier = hasAuth ? await fetchTier(cookieHeader) : undefined;
```

Two conditional branches:
1. **No auth + has data** → Fetch the cached AI summary. Anonymous visitors see the seed data's pre-generated summary.
2. **Has auth** → Fetch the subscription tier. Authenticated users need tier info for the paywall behavior (full summary vs. truncated preview).

These branches are mutually exclusive in practice. An anonymous visitor gets the cached summary. An authenticated user gets the tier. Neither path runs for the other user type.

### Helper functions

```typescript
async function fetchCachedSummary(datasetId: number): Promise<CachedSummaryResult | undefined> {
  try {
    const res = await apiServer<{ content: string; metadata: TransparencyMetadata | null }>(
      `/ai-summaries/${datasetId}/cached`,
    );
    return { content: res.data.content, metadata: res.data.metadata };
  } catch {
    return undefined;
  }
}
```

Both `fetchCachedSummary` and `fetchTier` swallow errors and return fallback values. The dashboard should render even if the AI cache or subscription service is down. Missing summary? The dashboard shows without it. Missing tier? Default to `'free'`. This is the resilience philosophy: degrade gracefully, don't crash on non-critical data.

## Complexity & Trade-offs

This is a medium-complexity page with several interesting trade-offs:

**Server-side fetching vs. client-side SWR** — Chart data and the cached summary are fetched once on the server. They don't need real-time updates (charts don't change unless the user uploads new data). The subscription tier could be fetched client-side with SWR, but doing it server-side avoids a flash of "free tier" UI before the actual tier loads.

**Sequential vs. parallel fetches** — The chart data fetch happens first because the cached summary fetch depends on `chartData.datasetId`. The tier fetch could theoretically run in parallel with the chart fetch (using `Promise.all`), but the conditional logic (`hasAuth` check) makes the sequential flow clearer.

**`undefined` vs. `null` for missing values** — `cachedSummary` is `undefined` when not fetched (anonymous path skipped, or fetch failed). `cachedMetadata` is `null` when the summary exists but has no metadata. The distinction matters: `undefined` means "we didn't try," `null` means "we tried and there isn't one."

## Patterns Worth Knowing

- **BFF cookie forwarding** — Reconstructing the `Cookie` header from `cookies().getAll()` for server-to-server requests. This is necessary because `fetch` in Server Components doesn't automatically forward browser cookies.
- **Discriminated error handling** — Catching `ApiServerError` separately from generic errors. Known API errors get graceful fallbacks. Unknown errors propagate to the error boundary. This prevents silent failures while still being resilient.
- **Server Component as data layer** — The page does all the fetching and passes props to a Client Component. No `useEffect` chains, no loading waterfalls. The client component receives everything it needs on first render.
- **Conditional server-side fetching** — Different users get different data fetches. The branching happens on the server, so the browser never makes unnecessary requests.

## Interview Questions

**Q: Why fetch the AI summary on the server for anonymous users but stream it client-side for authenticated users?**
A: Anonymous users see a pre-generated cached summary — it's static content that benefits from server rendering (instant display, SEO-friendly, no JS required). Authenticated users trigger on-demand AI generation, which uses SSE streaming for real-time token delivery. Streaming requires a persistent connection, which can only be managed client-side. The server fetches what's cacheable; the client handles what's real-time.

**Q: Why not use `Promise.all` for the chart data and tier fetches?**
A: The tier fetch only runs for authenticated users (`hasAuth` check), and the cached summary fetch depends on `chartData.datasetId` from the chart response. The conditional logic makes `Promise.all` awkward — you'd need to resolve the conditions first, then parallelize what remains. For two fast API calls to a co-located server, the serial latency is negligible.

**Q: What happens if the API is completely down?**
A: `fetchCachedSummary` and `fetchTier` return fallback values (`undefined` and `'free'`). The chart data fetch throws on non-API errors (network failures), which hits Next.js's error boundary. So: partial API failure degrades gracefully, complete outage shows an error page. The priority is getting the dashboard to render with whatever data is available.

**Q: How does this interact with Next.js caching?**
A: `apiServer` calls go through `fetch`, and this page reads cookies — which makes it dynamic (not statically cacheable). Every request runs the full server component. If you wanted static generation for anonymous users, you'd need to separate the anonymous and authenticated paths into different rendering strategies, potentially using Partial Prerendering (PPR).

## Data Structures

```typescript
interface ChartData {
  revenueTrend: Array<...>;
  expenseBreakdown: Array<...>;
  orgName: string;
  isDemo: boolean;
  availableCategories: string[];
  dateRange: string | null;
  demoState: 'seed_only' | 'seed_plus_user' | 'user_only' | 'empty';
  datasetId: number | null;
}

interface CachedSummaryResult {
  content: string;                       // the AI-generated text
  metadata: TransparencyMetadata | null; // model version, prompt version, stats used
}

type SubscriptionTier = 'free' | 'pro';
```

The `DashboardShell` receives all of this as props: `initialData` (charts), `cachedSummary` (optional pre-generated text), `cachedMetadata` (optional AI transparency info), and `tier` (optional subscription level).

## Impress the Interviewer

The most interesting thing here is the dual-audience data strategy. The same page serves two fundamentally different experiences — a static pre-rendered demo for anonymous visitors and a dynamic tier-gated app for authenticated users — and the branching happens entirely on the server. The browser doesn't know which path ran. It just gets props and renders.

This is also a good example of "the server component as orchestrator." The page doesn't render charts or summaries itself. It fetches data, handles errors with fallbacks, and passes a clean prop bundle to a single Client Component. The page's job is data acquisition and error strategy. The shell's job is rendering and interaction. Clean separation of concerns with the Server/Client boundary as the dividing line.
