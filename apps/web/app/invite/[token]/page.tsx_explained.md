# InvitePage — Interview-Ready Documentation

## Elevator Pitch

This is a Next.js 16 App Router page that handles org invite links. When someone clicks `/invite/<token>`, this server component extracts the token from the URL and hands it to a client component that manages the actual accept/decline flow.

## Why This Approach

Next.js 16 made `params` a Promise (breaking change from earlier versions). This page awaits it server-side, then passes the plain string down to `InviteAccept` — a client component that needs the token for API calls. The split keeps the page itself as a server component (good for SEO metadata via `export const metadata`) while the interactive join flow lives in a separate client boundary.

An alternative would be reading the token client-side with `useParams()`, but that means the component can't be a server component at all, and you lose the static metadata export.

## Code Walkthrough

- **`metadata` export**: Sets the page title for the browser tab. This is a server-only Next.js convention — you can't export metadata from a client component.
- **`params` as Promise**: `params: Promise<{ token: string }>` is the Next.js 16 way. Earlier versions gave you params as a plain object. The `await` unwraps it.
- **`InviteAccept`**: Receives the raw token string. All the state management, API calls, and error handling live there — this page is just the layout shell.

## Complexity & Trade-offs

Almost zero complexity here — and that's the point. The page is a thin wrapper. The trade-off is that you need a separate `InviteAccept.tsx` client component, which adds a file, but it cleanly separates server concerns (metadata, param extraction) from client concerns (interactive UI, fetch calls).

## Patterns Worth Knowing

- **Server Component + Client Component split**: The page is a server component that renders a client component. This is the standard App Router pattern — you push interactivity as far down the tree as possible.
- **Async params in Next.js 16**: If an interviewer asks about Next.js 16 changes, `params` becoming a Promise is one of the headline breaking changes.

## Interview Questions

**Q: Why is `params` a Promise in Next.js 16?**
A: Next.js 16 made dynamic route params async to support partial prerendering (PPR). The runtime can start rendering static parts of the page before dynamic params resolve. You `await` them in server components or use `React.use()` in client components.

**Q: Why not read the token client-side?**
A: You could use `useParams()`, but then the entire page becomes a client component and you lose the ability to export static metadata. The server/client split keeps the page lean.

**Q: What's `InviteAccept` doing that requires client-side rendering?**
A: It makes fetch calls to accept/decline the invite, manages loading/error states, and likely redirects on success. All of that needs `useState`, `useEffect`, or event handlers — client-only APIs.

## Data Structures

```typescript
// Route params (Next.js 16 async)
params: Promise<{ token: string }>

// The token is an opaque string — the server hashes it and looks up the invite
```

## Impress the Interviewer

The interesting bit isn't this file — it's understanding *why* it's so small. In App Router, pages should be thin orchestrators. The real logic lives in the client component (`InviteAccept`) and the API route that validates the token. This page's job is: extract param, set metadata, render shell. If you can explain that separation clearly, you demonstrate you understand the App Router mental model.
