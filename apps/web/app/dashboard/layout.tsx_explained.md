# dashboard/layout.tsx — Interview-Ready Documentation

## Elevator Pitch

The dashboard layout wraps every page under `/dashboard` with a sidebar, header, and the sidebar's open/close state. It reads the auth cookie on the server to determine whether the user is logged in and whether they're an admin, then passes that info to the UI components — all before any JavaScript runs in the browser.

## Why This Approach

Dashboard layouts need to know about authentication, but they shouldn't *block* on it. This project makes the dashboard public — anonymous visitors see seed data. So the layout reads the access token cookie and derives two booleans: `isAuthenticated` (controls what the header shows) and `isAdmin` (controls whether admin nav items appear in the sidebar). Neither blocks rendering.

Reading cookies in a Server Component is a server-only operation. The cookie value never appears in client-side JavaScript unless you explicitly pass it. Here, only the derived booleans cross the server/client boundary — the raw JWT stays on the server.

The `SidebarProvider` wraps the whole layout to manage sidebar open/close state via React context. The `isAdmin` prop flows into the provider so sidebar nav items can conditionally render admin links.

## Code Walkthrough

```typescript
const cookieStore = await cookies();
const accessToken = cookieStore.get(AUTH.COOKIE_NAMES.ACCESS_TOKEN)?.value;
const isAuthenticated = !!accessToken;
const isAdmin = extractIsAdmin(accessToken);
```

`cookies()` is async in Next.js 16 (it returns a `Promise`). `AUTH.COOKIE_NAMES.ACCESS_TOKEN` comes from the `shared/constants` package — the cookie name is a shared constant between frontend and backend, preventing typos.

`extractIsAdmin` presumably decodes the JWT payload (without verifying — that's the API's job) to read an `is_platform_admin` claim. This is safe for UI-only decisions (showing/hiding a menu item), not for authorization (the API verifies the token on every request).

```typescript
<a
  href="#main-content"
  className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
>
  Skip to main content
</a>
```

Skip navigation link. Invisible (`sr-only`) until a keyboard user tabs to it, then it becomes visible and positioned at the top-left. Clicking it jumps to `#main-content`, bypassing the sidebar and header. Required for WCAG 2.1 AA compliance.

```typescript
<div className="flex h-screen overflow-hidden bg-background">
  <Sidebar />
  <div className="flex flex-1 flex-col overflow-hidden">
    <AppHeader isAuthenticated={isAuthenticated} />
    <main id="main-content" className="flex-1 overflow-y-auto">
      {children}
    </main>
  </div>
</div>
```

Classic sidebar layout: a flex container with the sidebar on the left and a vertical stack (header + content) filling the rest. `h-screen overflow-hidden` on the outer container prevents the page from scrolling — instead, the `main` element scrolls independently (`overflow-y-auto`). This keeps the sidebar and header fixed in place.

## Complexity & Trade-offs

Moderate complexity. The main trade-off is reading the JWT on the server without verification. The server could call the API to verify the token and get the user's role, but that would add latency to every dashboard page load. Since the layout only uses this information for UI decisions (which link to show, what name to display), unverified JWT claims are acceptable. The API enforces real authorization on every request.

The `SidebarProvider` adds a context boundary here. Any component inside the dashboard layout can read sidebar state (open/closed) and the admin flag. Components outside (like the billing page or share pages) don't have access — which is correct, since they don't have sidebars.

## Patterns Worth Knowing

- **Server-side cookie reading** — `cookies()` in a Server Component. The values are available at request time without client JavaScript. You can derive auth state, user preferences, or feature flags from cookies before rendering.
- **UI-only JWT decoding** — Reading JWT claims client-side (or server-side without verification) is fine for display purposes. Never use it for authorization. An expired or tampered token might still show "admin" in the sidebar, but the API will reject the request.
- **Skip navigation link** — An accessibility pattern that's easy to implement and required for compliance. The `sr-only` + `focus:not-sr-only` Tailwind pattern makes it invisible to mouse users and visible to keyboard users.
- **Fixed sidebar + scrollable content** — `h-screen overflow-hidden` on the wrapper + `overflow-y-auto` on the content area. The sidebar and header stay in place while the main content scrolls.

## Interview Questions

**Q: Why not verify the JWT server-side in the layout?**
A: Verification requires either a shared secret or a public key, plus a cryptographic operation on every request. The layout only needs to know "is there a token?" and "does the token claim admin?" — these are UI hints. If the token is expired or tampered with, the worst case is a sidebar shows an admin link that leads to an API error. The API always verifies the token before doing anything meaningful.

**Q: What's the difference between this nested layout and the root layout?**
A: The root layout wraps everything — it sets up the HTML document, font, and theme. This dashboard layout wraps only `/dashboard/*` routes — it adds the sidebar, header, and sidebar context. A user visiting `/login` or `/share/[token]` gets the root layout but not the dashboard layout. Nested layouts compose; they don't replace each other.

**Q: Why is the sidebar state managed in a context provider instead of a global store?**
A: The sidebar only exists inside the dashboard layout. A global store (like Zustand) would make the state available everywhere, including pages that don't have a sidebar. Context providers naturally scope state to a subtree. Components outside the provider can't accidentally depend on sidebar state.

## Data Structures

Two derived values from the cookie:
- **`isAuthenticated: boolean`** — Whether an access token cookie exists
- **`isAdmin: boolean`** — Whether the JWT payload contains the platform admin claim

These are the only pieces of auth state that cross into the client-side component tree from this layout.

## Impress the Interviewer

The interesting architectural decision is that the dashboard is public. Most apps would have a layout like this redirect unauthenticated users to `/login`. This one doesn't — it lets anonymous users see the full dashboard experience with seed data. The `isAuthenticated` boolean controls what the header shows (sign-in button vs. user menu), not whether you can see the page.

That's a product strategy implemented as an architecture choice. The layout code is the enforcement point for "the dashboard is the landing page." If someone later tries to add an auth guard here, they'd be changing a deliberate product decision, not fixing a missing feature.
