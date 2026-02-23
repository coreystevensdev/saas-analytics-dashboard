# route.ts — Admin Users List BFF Proxy

## Elevator Pitch

A BFF proxy for the admin user management page. Forwards GET requests to Express's `/admin/users` endpoint with auth cookies. Structurally identical to the orgs list route — cookie forwarding, transparent status codes, 502 on upstream failure.

## Why This Approach

Same BFF proxy pattern. The admin panel needs to list users, and the browser can't call Express directly (different port, same-origin policy). This route bridges the gap.

## Code Walkthrough

Nothing new here compared to the orgs list route. Extract cookie, fetch from Express, return response, catch network errors. The route is 20 lines of straightforward proxy logic.

The only reason this gets its own route file (instead of sharing with orgs) is that Next.js App Router maps file paths to URL paths. `/api/admin/users` needs a file at `app/api/admin/users/route.ts`. There's no way around that.

## Complexity & Trade-offs

No complexity. The trade-off discussion is the same as the orgs route: explicit files vs. a dynamic catch-all proxy. Explicit wins for debuggability and matches the App Router convention.

## Patterns Worth Knowing

- **Convention over configuration** — Next.js App Router uses the file system as the router. Each URL path needs a corresponding file. This is a deliberate trade-off: more files, but zero routing configuration.

## Interview Questions

**Q: These admin proxy routes are nearly identical. How would you DRY them up?**
A: A shared `proxyGet(path: string)` helper that returns a route handler function. Something like:

```typescript
export const GET = createAdminProxy('/admin/users');
```

The helper handles cookie extraction, fetch, error handling. You'd still need one `route.ts` per path (App Router requirement), but each would be a one-liner. Worth doing once you have 5+ identical routes.

**Q: What's the security model for admin routes?**
A: Multi-layered. `proxy.ts` (Next.js middleware) protects `/admin` routes at the edge. Express middleware checks `is_platform_admin` on the JWT. The proxy layer just forwards — it doesn't make authorization decisions.

## Data Structures

Pass-through. Express returns:

```typescript
{ data: User[] }
```

## Impress the Interviewer

If you're walking through the admin routes as a group, the best thing you can say is: "These are intentionally boring. The proxy layer's job is to be invisible — forward cookies, forward responses, handle upstream failures. All the interesting logic is in Express. If I found myself adding business logic to a BFF proxy, I'd question whether it belongs there."
