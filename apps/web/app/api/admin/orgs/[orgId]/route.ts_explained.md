# route.ts — Admin Single Org BFF Proxy

## Elevator Pitch

A BFF proxy for fetching a single organization by ID. The interesting bit is the Next.js 16 dynamic route parameter handling — `params` is a `Promise` now, which is a breaking change from earlier versions.

## Why This Approach

Same BFF pattern as the other admin routes, but this one uses a dynamic route segment (`[orgId]`). In Next.js 16, dynamic params are delivered as a Promise, so you `await params` before using the value. This is a departure from Next.js 14/15 where params were synchronous.

## Code Walkthrough

1. **Async params** — `{ params }: { params: Promise<{ orgId: string }> }` is the Next.js 16 signature for dynamic route handlers. You destructure `orgId` from `await params`. If you forget the `await`, you get `[object Promise]` interpolated into your URL — a common gotcha after upgrading.

2. **URL interpolation** — The `orgId` goes directly into the Express URL path: `/admin/orgs/${orgId}`. Express handles validation (is it a UUID? does it exist?). The proxy doesn't validate — that's the backend's job.

3. **No try/catch** — Like the analytics-events route, this one skips upstream error handling. Inconsistent with the other admin routes but functionally fine — Next.js returns a 500 if fetch throws.

## Complexity & Trade-offs

Minimal. The only thing worth noting is that `orgId` from the URL is user-controlled input that gets interpolated into a fetch URL. Since it's going to a trusted internal service (Express on localhost), and Express validates it, this is safe. If Express were external, you'd want to validate the format here to prevent SSRF.

## Patterns Worth Knowing

- **Next.js 16 async params** — Route handler params became async in Next.js 16. This catches a lot of people upgrading. The `Promise<{ paramName: string }>` type annotation is the tell.
- **Dynamic route segments** — `[orgId]` in the folder name maps to a URL parameter. This is standard Next.js App Router convention.

## Interview Questions

**Q: Why are params a Promise in Next.js 16?**
A: Next.js moved to async params to support partial prerendering and streaming. When the framework can start rendering before all params are resolved, making them async gives it more flexibility. For route handlers (API routes), the practical impact is small — you just add `await`.

**Q: Should the proxy validate the orgId format before forwarding?**
A: For internal-only proxies (localhost to localhost), no. Express validates it anyway, and duplicating validation creates maintenance burden. If the proxy were forwarding to an external service, input validation would matter for SSRF prevention.

**Q: What happens if someone passes `../../secrets` as the orgId?**
A: URL path traversal in a `fetch` call doesn't work the way it does in file systems. The fetch goes to `http://localhost:3001/admin/orgs/../../secrets`, which the HTTP client resolves and Express routes. Express would return a 404 or 400. No directory traversal risk.

## Data Structures

The route extracts one param:

```typescript
{ orgId: string }  // UUID format, validated by Express
```

Response is the standard org detail shape from Express.

## Impress the Interviewer

Mention the async params change. It's a Next.js 16 breaking change that most tutorials haven't caught up with. If the interviewer asks "what was tricky about the upgrade," this is a concrete example — not a vague "oh, some APIs changed," but "params became async, and if you forget to await, you get `[object Promise]` in your URLs, which is a silent bug that only shows up at runtime."
