# layout.tsx — Interview-Ready Documentation

## Elevator Pitch

The server-side layout for the entire `/admin` section. It reads the JWT from cookies, extracts the admin flag, and wraps every admin page in the app shell (sidebar, header, skip-to-content link). If you're not an admin, the sidebar context knows — though route protection happens upstream in `proxy.ts`.

## Why This Approach

Next.js App Router layouts are persistent — they don't re-render when you navigate between child routes. That makes them the right place for the app shell (sidebar, header) and authentication checks that should run once per navigation, not once per page.

Reading the cookie on the server (via `await cookies()`) means no client-side flash of unauthenticated state. The JWT is already in the request; no extra round-trip needed. `extractIsAdmin` decodes the token to pull the `is_platform_admin` claim without verifying the signature — that's the API's job. The layout just needs to know whether to show admin nav items.

The alternative — a client component that fetches `/api/me` — would add a waterfall request and a loading flicker for the sidebar.

## Code Walkthrough

The layout is an async server component. Here's the sequence:

1. `await cookies()` gets the cookie store from the incoming request.
2. It reads the access token cookie using the constant from `shared/constants` (so the cookie name is consistent across the monorepo).
3. `isAuthenticated` is a simple boolean — does the cookie exist?
4. `extractIsAdmin` decodes the JWT payload (base64, no verification) and returns the admin flag.
5. Everything wraps in `SidebarProvider` with the `isAdmin` prop, which controls which nav items the sidebar renders.
6. The skip-to-content link (`sr-only` + `focus:not-sr-only`) is an accessibility pattern — keyboard users can skip past the sidebar and header.
7. The `<main>` tag has `id="main-content"` matching the skip link's `href`.

## Complexity & Trade-offs

**Gained**: Zero-JS layout shell. No loading state for the frame. Admin flag available immediately.

**Sacrificed**: The layout trusts the JWT payload without signature verification. This is fine because the API re-verifies every request, and the layout only uses the claim for UI rendering (showing/hiding nav items), not for authorization decisions. An attacker who forges the JWT would see admin nav items but get 403s from every API call.

**Scaling**: If you add more admin sub-routes (`/admin/settings`, `/admin/billing`), they all inherit this layout automatically. No changes needed here.

## Patterns Worth Knowing

- **Server-side cookie reading**: `cookies()` is a Next.js server function. It reads from the request headers, not `document.cookie`. Available in server components, route handlers, and server actions.
- **Persistent layouts**: App Router layouts don't unmount on navigation. State in `SidebarProvider` (like sidebar open/closed) persists across admin pages.
- **Skip navigation link**: The `sr-only` → `focus:not-sr-only` pattern hides a link visually but makes it the first focusable element for keyboard and screen reader users.

## Interview Questions

**Q: Why read the cookie on the server instead of using a client-side auth hook?**
A: Server-side reading eliminates the auth waterfall. The cookie is already in the HTTP request — there's no round-trip. The layout renders with the correct state immediately, no loading spinner for the shell.

**Q: Why doesn't this layout verify the JWT signature?**
A: The layout uses the JWT claim only for UI rendering (should the sidebar show admin links?). Authorization happens on the API side. Verifying the signature here would require importing the secret into the frontend build, which is a security risk and architecturally wrong in a BFF pattern.

**Q: What happens if a non-admin somehow navigates to /admin?**
A: `proxy.ts` (Next.js middleware) gates `/admin` routes — non-admins get redirected before this layout ever renders. The layout is a second layer: even if someone bypasses the middleware, the API returns 403 for non-admin requests.

**Q: Why is SidebarProvider here instead of in the root layout?**
A: The admin section has its own navigation structure. Putting the provider here means the sidebar state (open/closed, which items are visible) is scoped to admin pages. The dashboard has its own separate layout with its own sidebar context.

## Data Structures

- `AUTH.COOKIE_NAMES.ACCESS_TOKEN` — string constant for the cookie name, shared across the monorepo
- `extractIsAdmin(token)` — decodes JWT payload, returns `boolean`
- `SidebarProvider` — React context provider that passes `isAdmin` to child components

## Impress the Interviewer

The layered defense model here is worth calling out. Route protection has three layers: (1) `proxy.ts` middleware redirects non-admins, (2) this layout reads the JWT to control what the UI shows, (3) the Express API verifies the JWT and checks `is_platform_admin` on every request. No single layer is sufficient alone — `proxy.ts` can be bypassed with direct API calls, the layout doesn't verify signatures, and the API doesn't control what the browser renders. Together, they cover all the angles. That's defense in depth, not paranoia.
