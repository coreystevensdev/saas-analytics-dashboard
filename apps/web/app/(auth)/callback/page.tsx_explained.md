# callback/page.tsx — Interview-Ready Documentation

## Elevator Pitch

This is the OAuth callback page — the place Google sends users after they approve (or deny) a sign-in request. It handles two cases: if Google reports an error, show a static error message. Otherwise, hand off the authorization code to a client component that completes the token exchange.

## Why This Approach

OAuth callbacks need to do two fundamentally different things depending on what comes back in the URL:

1. **Error from the provider** — Google denied the request (user clicked "Cancel", or something went wrong). This can be handled entirely on the server with static HTML. No JavaScript needed.
2. **Success with an auth code** — The code needs to be exchanged for tokens via the API, cookies need to be set, and the user needs to be redirected. That's client-side work (the `CallbackHandler` component handles it).

By making this a Server Component that conditionally renders either an error screen or the `CallbackHandler`, you get the fastest possible error experience (server-rendered HTML, no JS bundle) while still supporting the interactive token exchange flow.

The `(auth)` route group in the path is a Next.js convention — the parentheses mean it affects folder organization but doesn't appear in the URL. Users visit `/callback`, not `/(auth)/callback`.

## Code Walkthrough

```typescript
export default async function CallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; state?: string; error?: string }>;
}) {
  const params = await searchParams;
```

In Next.js 16, `searchParams` is a `Promise` (it changed from being a plain object in earlier versions). You `await` it to get the actual query parameters. This is an async Server Component — totally valid in React 19 / Next.js 16.

The three query params map to the OAuth 2.0 spec: `code` is the authorization code, `state` is the CSRF token you sent with the original request, and `error` is set if something went wrong.

```typescript
if (params.error) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      ...
      <a href="/login" ...>Back to Sign In</a>
    </div>
  );
}
```

Early return for the error case. Notice it uses a plain `<a>` tag instead of Next.js `<Link>`. That's fine here — this is a dead-end error page, and a full page navigation back to login is appropriate (you actually *want* to reset any in-memory state).

```typescript
return <CallbackHandler code={params.code} state={params.state} />;
```

The happy path delegates to a Client Component. The server extracts the params and passes them as props — the client component doesn't need to parse `window.location.search` itself.

## Complexity & Trade-offs

Low complexity, but the Server Component → Client Component handoff is a pattern worth understanding. The server does the cheap work (reading URL params, rendering error HTML), and the client does the expensive work (API calls, cookie management, redirects).

The trade-off: if the `CallbackHandler` fails (network error during token exchange), the error handling lives there, not here. This page only handles Google-reported errors, not application-level failures.

## Patterns Worth Knowing

- **Async Server Components** — React 19 lets server components be `async` and `await` data directly. No `useEffect`, no loading states. The server waits for the data and sends complete HTML.
- **Route groups `(auth)`** — Organize related routes without affecting URLs. The login and callback pages share an `(auth)` group, which could have its own layout (e.g., a minimal chrome layout without sidebar).
- **Server/Client component boundary** — Props flow from server to client. The server reads `searchParams` (a server-only API) and passes the values down. The client component never touches `searchParams` directly.

## Interview Questions

**Q: Why is `searchParams` a Promise in Next.js 16?**
A: Next.js 16 made `searchParams` (and `params`) asynchronous to support Partial Prerendering (PPR). The static shell of a page can be prerendered, and the dynamic parts (like query parameters) resolve at request time. Making them promises allows the framework to optimize what gets cached vs. what's computed per-request.

**Q: Why split this into a Server Component page and a Client Component handler?**
A: The error case needs zero JavaScript — it's static HTML. The success case needs to make API calls and manage browser state. By splitting them, the error path ships less JS to the browser, and the success path gets full client-side capabilities. If everything were a Client Component, even the error page would need the JS bundle to render.

**Q: How does OAuth CSRF protection work with the `state` parameter?**
A: Before redirecting to Google, the app generates a random `state` value and stores it (typically in a cookie or session). Google includes it in the callback URL. The `CallbackHandler` verifies that the returned `state` matches what was stored. This prevents an attacker from crafting a callback URL with someone else's authorization code.

## Data Structures

The search params follow the OAuth 2.0 Authorization Code flow spec:

```typescript
{ code?: string; state?: string; error?: string }
```

- `code` — Short-lived authorization code to exchange for access/refresh tokens
- `state` — CSRF protection token, round-tripped through the OAuth flow
- `error` — Error code from Google (e.g., `access_denied`)

## Impress the Interviewer

Point out the progressive enhancement angle. If JavaScript fails to load (slow connection, CDN issue), the error page still works perfectly — it's server-rendered HTML with a plain anchor tag. The success path needs JS, but that's inherent to the token exchange process. This isn't accidental; it's a deliberate split based on what each path actually requires.
