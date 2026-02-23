# route.ts — Admin Orgs List BFF Proxy

## Elevator Pitch

A BFF proxy that lets the admin dashboard list all organizations. It forwards a GET request to Express's `/admin/orgs` endpoint, passing along auth cookies. Standard proxy pattern with upstream error handling.

## Why This Approach

Same rationale as every BFF route in this project: same-origin cookie forwarding, no CORS, backend topology hidden from the browser. This is a thin pass-through — the real authorization logic (checking `is_platform_admin`) lives in Express middleware, not here.

## Code Walkthrough

Identical structure to the health check route:

1. Extract cookies from the incoming request
2. Fetch from Express at `/admin/orgs`
3. Return the JSON response with the upstream status code
4. Catch network failures and return 502 with `UPSTREAM_UNAVAILABLE`

Nothing surprising here. The route doesn't add query parameter forwarding (no pagination yet for admin org listing) or body parsing (it's a GET).

## Complexity & Trade-offs

Zero complexity. This is boilerplate, and that's fine. The alternative — generating these proxy routes dynamically — would save a few files but make the routing opaque. Explicit route files are easy to find, easy to debug, and match Next.js App Router conventions.

## Patterns Worth Knowing

- **Thin proxy** — When a proxy route adds no logic, it's intentional. The value is in the architectural boundary (same-origin, cookie forwarding), not in the code itself.

## Interview Questions

**Q: With so many similar proxy routes, why not create a generic proxy helper?**
A: You could. A `createBffProxy(path)` factory would reduce repetition. The trade-off is discoverability — with explicit route files, you can grep for any endpoint path and find exactly where it's handled. A few routes also have unique behavior (query params, body forwarding, cookie pass-through from responses), so the "generic" version would still need escape hatches.

**Q: Where does the actual authorization happen?**
A: In Express middleware. The API checks `users.is_platform_admin` before returning data. The proxy just forwards the cookie — it doesn't inspect the JWT or make access decisions.

## Data Structures

Pass-through. The Express API returns:

```typescript
{ data: Org[] }
```

where `Org` includes fields like `id`, `name`, `createdAt`, member count, etc.

## Impress the Interviewer

If asked about code duplication across these proxy routes, have a take: "I'd consider extracting a helper once the pattern stabilizes, but right now each route is 15 lines and some have unique behavior. The cost of duplication is low, and the cost of a bad abstraction is higher." That's a mature engineering opinion — resist premature abstraction.
