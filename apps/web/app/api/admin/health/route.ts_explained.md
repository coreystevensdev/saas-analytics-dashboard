# route.ts — Admin Health Check BFF Proxy

## Elevator Pitch

A BFF proxy route that checks whether the Express API is alive. It forwards the request to Express's `/admin/health` endpoint and returns the result. The interesting part: it's the one admin route where a network failure is an expected scenario, not an edge case — so the try/catch with a 502 `UPSTREAM_UNAVAILABLE` response is load-bearing here.

## Why This Approach

Health checks exist so dashboards and monitoring tools can ask "is the backend up?" If the proxy itself throws an unhandled error when Express is unreachable, the health check is useless — you get a generic 500 instead of a clear "the API is down" signal.

The structured 502 response with `UPSTREAM_UNAVAILABLE` gives the admin UI enough information to display a meaningful status indicator rather than a vague error.

## Code Walkthrough

Standard BFF proxy pattern with one important addition:

1. **Cookie forwarding** — Same as every other admin route. The health endpoint is admin-only, so auth cookies still need to travel.

2. **Happy path** — Fetch from Express, parse JSON, return with the same status code.

3. **Catch block** — If `fetch` throws (Express is down, DNS fails, timeout), return a structured error response. The `catch` doesn't capture the error variable because there's nothing useful to do with it — the fact that the request failed is the message.

The 502 status code is correct here. 502 means "Bad Gateway" — the proxy received an invalid response (or no response) from the upstream server. That's exactly what happened.

## Complexity & Trade-offs

Minimal complexity. The only design decision is whether to expose raw fetch errors or return a structured response. This route picks structured, which is the right call for a health check — the consumer needs machine-readable status, not a stack trace.

## Patterns Worth Knowing

- **502 Bad Gateway** — The correct HTTP status when a proxy can't reach its upstream. Not 500 (that's the proxy's own fault) and not 503 (that implies the proxy itself is overloaded).
- **Empty catch clause** — `catch { }` without a variable binding. Valid TypeScript. Signals "I know this can fail and I don't need the error details."

## Interview Questions

**Q: Why 502 instead of 503?**
A: 502 means the gateway got a bad response from upstream. 503 means the server itself can't handle requests. Here, the Next.js proxy is fine — it's Express that's unreachable. 502 is semantically correct.

**Q: Why does a health check need authentication?**
A: This is an admin health check, not a public uptime probe. It probably returns internal details (DB connection status, Redis status, queue depth) that shouldn't be public. A public health check would be a separate, unauthenticated endpoint.

**Q: Why not log the error in the catch block?**
A: The proxy layer's job is forwarding, not monitoring. Express has its own logging (Pino). If Express is down, the proxy can't log to Express's logger. You'd need a separate logging pipeline for the Next.js layer — worth doing in production, but out of scope for this route.

## Data Structures

The Express health endpoint typically returns something like:

```typescript
{
  data: {
    status: 'healthy' | 'degraded' | 'unhealthy',
    db: boolean,
    redis: boolean,
    uptime: number
  }
}
```

The proxy doesn't inspect or transform this — it passes it through unchanged.

## Impress the Interviewer

The thing to call out: a health check proxy is the one place where the try/catch isn't defensive programming — it's the core logic. Every other route treats "Express is down" as an unlikely failure. This route treats it as a normal response case. The 502 with structured JSON is how the admin dashboard distinguishes "the health check says things are bad" from "the health check itself broke."
