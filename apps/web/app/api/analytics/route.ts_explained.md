# route.ts — Analytics Event Tracking BFF Proxy

## Elevator Pitch

This is the BFF proxy for client-side analytics event ingestion. The browser fires tracking events (page views, button clicks, feature usage) and this route forwards them to Express for storage. It's the most defensive proxy route in the project — double try/catch, body validation, status code remapping, and explicit runtime/caching directives.

## Why This Approach

Analytics events are fire-and-forget from the browser's perspective, but the proxy still needs to be robust. A broken analytics pipeline is a silent failure — you won't notice until you look at your dashboard and see gaps. The extra error handling here reflects that: you want clear signal when things break, not swallowed errors.

The `runtime = 'nodejs'` and `dynamic = 'force-dynamic'` exports are explicit opt-outs from Next.js's edge runtime and caching. Analytics POSTs should never be cached, and they need the Node.js runtime for reliable server-to-server fetch behavior.

## Code Walkthrough

1. **Runtime directives** — `export const runtime = 'nodejs'` ensures this runs on Node, not the edge runtime. `export const dynamic = 'force-dynamic'` tells Next.js to never cache this route's responses. Both are important for a POST endpoint that writes data.

2. **Body parsing with validation** — The first try/catch parses the request body as JSON. If the client sends malformed JSON, the route returns a 400 immediately instead of forwarding garbage to Express. This is one of the few proxy routes that validates input before forwarding.

3. **Upstream fetch** — Standard cookie-forwarded POST to Express at `/analytics/events`. The body gets re-serialized with `JSON.stringify(body)` and the `Content-Type` header is set explicitly.

4. **Error response remapping** — `upstream.status >= 500 ? 502 : upstream.status` is a deliberate choice. If Express returns a 500 (its own bug), the proxy reports 502 (bad gateway) to distinguish "Express broke" from "the proxy broke." Client-side 4xx errors (400, 401, 403) pass through unchanged.

5. **Double-safe response parsing** — The inner try/catch around `upstream.json()` handles the case where Express returns a non-JSON error (like an nginx HTML error page). Instead of crashing, it returns a generic structured error.

6. **Network failure catch** — The outer try/catch handles "Express is completely unreachable" — different from "Express responded with an error."

## Complexity & Trade-offs

This is the most complex proxy route in the project, but the complexity maps to real failure modes:

- Client sends bad JSON → 400
- Express returns 4xx → forwarded as-is
- Express returns 5xx → remapped to 502
- Express returns non-JSON → generic error
- Express unreachable → 502 with `UPSTREAM_UNREACHABLE`

The trade-off: more code means more to maintain. But analytics ingestion is high-volume and loss-sensitive, so the defensive coding is justified.

The `{ data: { ok: true } }` success response is intentionally minimal. The client doesn't need the stored event echoed back — it just needs confirmation.

## Patterns Worth Knowing

- **Status code remapping in proxies** — Converting upstream 5xx to 502 is standard practice. It tells the client "the problem isn't with me, it's with what's behind me." Load balancers and monitoring tools key off this distinction.
- **Defensive JSON parsing** — Wrapping `response.json()` in try/catch handles upstream responses that aren't actually JSON (502 pages from reverse proxies, HTML error pages, empty bodies).
- **Next.js route segment config** — `export const runtime` and `export const dynamic` are route-level configuration exports. They're how you control per-route behavior in the App Router without a centralized config file.

## Interview Questions

**Q: Why parse the body before forwarding it? Can't Express validate it?**
A: Express can and does validate. But if the client sends `{invalid json`, the fetch to Express would send a broken body and Express would return a 400 anyway. Catching it early saves a network round-trip and gives a clearer error message to the client.

**Q: Why remap 500 to 502 but leave 400-series codes alone?**
A: 4xx errors are the client's fault — bad input, missing auth, forbidden resource. The proxy should report those faithfully. 5xx errors are Express's fault, and from the client's perspective, that's a gateway issue. 502 communicates "the service behind me had a problem."

**Q: What's `force-dynamic` doing here?**
A: Next.js can cache route handler responses. For a POST endpoint that writes data, caching would be catastrophic — events would be silently dropped. `force-dynamic` ensures every request hits the handler.

**Q: Why `runtime = 'nodejs'` instead of edge?**
A: Edge runtime has limitations — no Node.js APIs, smaller memory, shorter execution time. Analytics event forwarding needs reliable fetch behavior and doesn't benefit from edge's lower latency (it's calling localhost anyway).

**Q: What happens if the analytics endpoint is rate-limited?**
A: Express returns a 429 (Too Many Requests). Since 429 < 500, it passes through unchanged. The client receives the 429 and can back off or drop the event — analytics clients typically don't retry.

## Data Structures

**Request body** (from client):
```typescript
{
  event: string,        // e.g., 'page_view', 'insight_shared'
  properties?: Record<string, unknown>
}
```

**Success response**:
```typescript
{ data: { ok: true } }
```

**Error responses**:
```typescript
{ error: { code: 'INVALID_BODY', message: 'Invalid JSON body' } }
{ error: { code: 'UPSTREAM_ERROR', message: 'Unexpected response from server' } }
{ error: { code: 'UPSTREAM_UNREACHABLE', message: 'API server unavailable' } }
```

## Impress the Interviewer

Walk through the three distinct failure modes and how each one maps to a different HTTP status and error code. Most junior developers write one try/catch around the whole thing. This route distinguishes between "client sent bad data" (400), "Express had an internal error" (502 with remapped status), "Express returned something unparseable" (502 with fallback error), and "Express is down" (502 with network error). That's the kind of operational thinking that separates "it works" from "it works in production."
