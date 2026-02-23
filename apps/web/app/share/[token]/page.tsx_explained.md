# share/[token]/page.tsx — Interview-Ready Documentation

## Elevator Pitch

The public share page. Given a token in the URL, it fetches the shared insight from the API and renders either the `SharedInsightCard` (happy path) or a `ShareError` (link is invalid or expired). It also generates dynamic OpenGraph metadata so the insight looks good when pasted into Slack, Twitter, or iMessage. One fetch function serves both purposes thanks to Next.js request memoization.

## Why This Approach

Share pages are public — no authentication required. A visitor clicks a link like `/share/abc123` and sees the AI-generated business insight that someone shared with them. The page needs to do three things:

1. **Fetch the share data** from the API using the token.
2. **Generate OG metadata** (title, description) so link previews show meaningful content.
3. **Render the right component** based on the API response (success, not found, or expired).

The key design choice is the `fetchShare` function, which is called from both `generateMetadata` and the page component. Next.js automatically deduplicates identical `fetch` calls within a single request, so the API is only hit once even though two functions call `fetchShare(token)`.

The error handling uses a discriminated union (`FetchResult`) instead of try/catch in the rendering code. The fetch function catches all errors internally and returns a structured result — `{ ok: true, data }` or `{ ok: false, status, message }`. The page component just reads the shape of the result.

## Code Walkthrough

### fetchShare — the shared data fetcher

```typescript
type FetchResult =
  | { ok: true; data: ShareData }
  | { ok: false; status: number; message: string };

async function fetchShare(token: string): Promise<FetchResult> {
  try {
    const res = await fetch(`${webEnv.API_INTERNAL_URL}/shares/${token}`, {
      cache: 'no-store',
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      const message = body?.error?.message ?? 'Share not found';
      return { ok: false, status: res.status, message };
    }

    const { data } = await res.json();
    return { ok: true, data };
  } catch {
    return { ok: false, status: 500, message: 'Unable to load shared insight' };
  }
}
```

A few things worth noting:

- **`webEnv.API_INTERNAL_URL`** — Server-to-server call. This uses the internal URL (like `http://api:3001`), not the public-facing URL. In production, the Next.js server and Express server are on the same network, so this avoids an unnecessary round trip through the load balancer.
- **`cache: 'no-store'`** — Shared insights can be revoked or expire. Caching would show stale data. Every request fetches fresh.
- **Defensive JSON parsing** — `res.json().catch(() => null)` handles the case where the API returns an error with a non-JSON body. Without this, a 502 from a proxy (which returns HTML) would throw during JSON parsing and mask the real error.
- **Status code preservation** — The `status` field is kept in the error result because 410 (Gone) means "expired" and 404 means "not found." The rendering logic uses this distinction.

### generateMetadata — dynamic OG tags

```typescript
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const result = await fetchShare(token);

  if (!result.ok) {
    return { title: 'Shared Insight — SaaS Analytics Dashboard' };
  }

  const { orgName, aiSummaryContent } = result.data;
  const ogTitle = truncateAtWord(aiSummaryContent, 60);
  const description = truncateAtWord(aiSummaryContent, 150);

  return {
    title: `${orgName} — Business Insight`,
    openGraph: {
      title: ogTitle,
      description,
      type: 'article',
      siteName: 'SaaS Analytics Dashboard',
    },
  };
}
```

`generateMetadata` runs on the server and produces the `<head>` tags. It calls `fetchShare(token)` — the same function the page component calls. Next.js deduplicates this, so one API call serves both.

`truncateAtWord` prevents OG titles and descriptions from being cut mid-word by social platforms. It finds the last space before the character limit and truncates there. Better to lose a few characters than to show "Revenue increased by 23% in Q1, with particul..." where the last word is gibberish.

### Page component — rendering by result shape

```typescript
export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await fetchShare(token);

  if (!result.ok) {
    const variant = result.status === 410 ? 'expired' : 'not-found';
    return (
      <div className="flex min-h-screen flex-col bg-background">
        ...
        <ShareError variant={variant} />
      </div>
    );
  }

  const { orgName, dateRange, aiSummaryContent } = result.data;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      ...
      <SharedInsightCard
        orgName={orgName}
        dateRange={dateRange}
        aiSummaryContent={aiSummaryContent}
      />
    </div>
  );
}
```

The `result.status === 410` check maps HTTP 410 (Gone) to the "expired" variant and everything else to "not-found." The page wraps both outcomes in the same minimal layout — a header bar with the app name and a centered content area.

Both paths are fully server-rendered. No JavaScript needed to display a shared insight or an error. The `SharedInsightCard` CTA link is a plain `<Link>` — the only interactive element on the page.

## Complexity & Trade-offs

Moderate complexity, primarily in the data fetching and error handling.

**Request memoization** — Calling `fetchShare` twice works because Next.js deduplicates `fetch` calls with the same URL within a request. But this only works with `fetch`, not with arbitrary functions. If you replaced `fetch` with an Axios call or a direct database query, you'd lose deduplication and need to use React's `cache()` wrapper instead.

**`cache: 'no-store'` means no ISR** — Every visitor triggers a fresh API call. For a high-traffic shared link, this could stress the API. If latency matters, you could add a short TTL (`next: { revalidate: 60 }`) to cache for 60 seconds. The trade-off is that a revoked share would still be visible for up to a minute.

**Minimal layout, no dashboard chrome** — The share page has its own layout (just a header bar), not the dashboard sidebar. Shared links are public — the viewer isn't a logged-in user, so dashboard navigation would be confusing.

## Patterns Worth Knowing

- **Discriminated union for fetch results** — `FetchResult` is either `{ ok: true, data }` or `{ ok: false, status, message }`. TypeScript narrows the type after checking `result.ok`, so you get full type safety on `result.data` without casting.
- **Next.js request memoization** — Identical `fetch` calls within a single server request are deduplicated automatically. This lets `generateMetadata` and the page component both call `fetchShare` without doubling the API load.
- **Word-boundary truncation** — `truncateAtWord` finds the last space before the limit. Social platforms truncate OG descriptions at arbitrary lengths; cutting at a word boundary prevents mid-word breaks.
- **Dynamic route segments** — `[token]` in the folder name becomes `params.token` in the component. Next.js 16 makes `params` a Promise, so you `await` it.
- **HTTP status code mapping** — Using the API's HTTP status (410 vs. 404) to choose the UI variant. The API communicates meaning through status codes; the UI maps those to user-facing copy. Clean separation of concerns.

## Interview Questions

**Q: How does Next.js request memoization work, and what are its limits?**
A: Within a single server request, Next.js deduplicates `fetch` calls with the same URL, method, and headers. The first call executes; subsequent calls return the cached response. This only works with the native `fetch` API — not Axios, not `node-fetch`, not direct database calls. If you need memoization for non-fetch operations, use React's `cache()` function.

**Q: Why return a discriminated union from `fetchShare` instead of throwing?**
A: Throwing would require try/catch in both `generateMetadata` and the page component, with error type checking in each. The discriminated union makes the error a regular value you can pattern-match on. The page checks `result.ok`, and TypeScript narrows the type automatically. It's also easier to test — you check return values instead of catching thrown errors. The project notes call this the "discriminated union error handling" pattern.

**Q: What would happen if you removed `cache: 'no-store'`?**
A: Next.js would cache the fetch response and serve it for subsequent requests. A shared insight would load faster after the first request, but if the share was revoked or expired, visitors would still see it until the cache expired. For a feature where links can be time-limited, freshness is more important than speed, so `no-store` is correct.

**Q: How do the OG meta tags get into the HTML if this is a server-rendered page?**
A: `generateMetadata` returns a `Metadata` object that Next.js renders into `<meta>` tags in the `<head>`. Since this runs on the server, the tags are present in the initial HTML response — crawlers (Slack's unfurler, Twitter's card validator) see them without executing JavaScript. This is one of the benefits of server rendering for share pages.

**Q: The page layout duplicates between the error and success paths. How would you DRY it up?**
A: Extract the wrapper (`min-h-screen` container + header bar) into a layout file at `app/share/[token]/layout.tsx`. The page would then only render `ShareError` or `SharedInsightCard`, and the shared chrome would come from the layout. The duplication here is minor (a few div wrappers), but if the layout grew more complex, extracting it would be worth it.

## Data Structures

```typescript
interface ShareData {
  orgName: string;
  dateRange: string;
  aiSummaryContent: string;
  chartConfig: Record<string, unknown>;  // available but not used in the card
  viewCount: number;                      // tracked but not displayed
}

type FetchResult =
  | { ok: true; data: ShareData }
  | { ok: false; status: number; message: string };
```

`chartConfig` and `viewCount` come from the API but aren't used in the current card design. `chartConfig` could power chart rendering in a future version. `viewCount` is tracked server-side (the API increments it atomically on each view) for analytics, but showing it to the visitor was a conscious omission — "3 people viewed this" doesn't add value for the share recipient.

## Impress the Interviewer

Three things stand out. First, the request memoization trick — calling `fetchShare` from two places with zero performance cost. It's a one-liner in the code but a design-level understanding of how Next.js server rendering works. Mention it explicitly in an interview.

Second, the defensive error handling. `res.json().catch(() => null)` handles proxy errors that return HTML instead of JSON. Most developers would let this throw and debug it in production. Handling it upfront shows you've dealt with real-world infrastructure issues (502s from Nginx, 503s from load balancers) where the response body isn't what your app expects.

Third, the product thinking. The share page doesn't have a login wall, doesn't show the dashboard navigation, and doesn't require any account. It's optimized for one thing: showing the insight and converting the visitor. `viewCount` is tracked silently. `chartConfig` is available but unused. The page does less than it could, and that's a deliberate product decision to minimize friction in the viral loop.
