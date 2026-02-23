# route.ts — Admin Analytics Events BFF Proxy

## Elevator Pitch

This is a BFF (Backend for Frontend) proxy that forwards admin analytics event queries from the browser to the Express API. The one twist: it preserves query string parameters, which most of the other proxy routes don't bother with because they don't need filtering or pagination on the backend.

## Why This Approach

The BFF proxy pattern means the browser never talks to Express directly. Every request goes through Next.js first, which sits on the same origin as the frontend. This eliminates CORS entirely — no preflight requests, no `Access-Control-Allow-Origin` headers, no debugging mysterious browser blocks.

The alternative would be exposing Express on a public port and configuring CORS. That works, but it leaks backend topology to the client and adds a whole class of security surface area you'd rather not think about.

## Code Walkthrough

The entire route is one exported `GET` handler, about 10 lines:

1. **Cookie forwarding** — `request.headers.get('cookie')` grabs the JWT (httpOnly, so JavaScript can't touch it) and passes it along to Express. This is how auth propagates through the proxy layer without the frontend ever seeing token values.

2. **Query string preservation** — `request.nextUrl.search` pulls the full `?foo=bar&baz=1` string. The comment in the code flags this as different from other BFF routes. Analytics events need server-side filtering (date ranges, event types, pagination), so the query params matter here.

3. **Transparent status forwarding** — Whatever Express returns (200, 401, 403, 500), this route passes it straight through. The frontend's error handling works the same whether it's talking to Express or this proxy.

No try/catch here — if Express is down, the fetch throws and Next.js returns a 500 automatically. Some of the other admin routes add explicit `UPSTREAM_UNAVAILABLE` handling; this one doesn't. Minor inconsistency, not a bug.

## Complexity & Trade-offs

This is about as simple as a proxy route gets. The trade-off is an extra network hop (browser → Next.js → Express), which adds a few milliseconds of latency. For an admin dashboard that humans look at, that's irrelevant.

The missing try/catch means a network failure returns a generic 500 instead of a structured `UPSTREAM_UNAVAILABLE` error. The other admin routes handle this. If you're asked about it in an interview, call it a consistency gap — easy fix, low priority.

## Patterns Worth Knowing

- **BFF Proxy** — A layer between client and backend that simplifies the client's view of the world. Common in microservice architectures. In this project, it's used for same-origin auth cookie forwarding.
- **Cookie-based auth propagation** — httpOnly cookies travel automatically with same-origin requests. The proxy just has to forward them explicitly when making server-to-server calls.

## Interview Questions

**Q: Why not just call the Express API directly from the browser?**
A: Same-origin policy. The Express API runs on port 3001, the frontend on port 3000. Cross-origin requests require CORS configuration, preflight OPTIONS requests, and expose backend infrastructure. The BFF proxy keeps everything same-origin.

**Q: Why does this route forward query parameters but others don't?**
A: Analytics events need server-side filtering — date ranges, event types, pagination. Most other admin routes return full collections that don't need query-based filtering at the API level.

**Q: What happens if the Express server is down?**
A: The `fetch` call throws a `TypeError` (network error). Without a try/catch, Next.js converts that into a generic 500 response. Other admin routes wrap this in a try/catch and return a structured 502 `UPSTREAM_UNAVAILABLE` error.

## Data Structures

The route itself doesn't define any types. It passes through whatever JSON the Express API returns. The standard API response format is:

```typescript
// Success
{ data: AnalyticsEvent[], meta?: { total: number, page: number } }

// Error
{ error: { code: string, message: string } }
```

## Impress the Interviewer

Point out the query string forwarding and why it matters. Most BFF proxies are fire-and-forget — grab cookies, forward request, return response. This one needs to preserve the query string because analytics events support server-side filtering. It's a small detail, but it shows you understand that proxy routes aren't all identical — each one needs to forward exactly what the downstream service expects.
