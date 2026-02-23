# error.tsx — Interview-Ready Documentation

## Elevator Pitch

The error boundary for the admin section. If any server or client error occurs within `/admin`, this component catches it and shows a card with the error message and a retry button — instead of crashing the whole app.

## Why This Approach

Next.js App Router uses `error.tsx` as a convention-based React Error Boundary. It must be a client component (`'use client'`) because error boundaries require class component lifecycle methods under the hood (React wraps your function component for you). The `reset` callback re-triggers the nearest Suspense boundary, effectively retrying the server component data fetch.

The alternative — a global error page — would blow away the admin layout (sidebar, header). By placing `error.tsx` inside `/admin`, only the main content area re-renders on error while navigation stays intact.

## Code Walkthrough

The component receives `error` (with an optional `digest` for server-side errors) and `reset` (a function that retries rendering). It renders a centered Card with an alert icon, the error message (falling back to a generic string), and a "Try again" button that calls `reset()`.

## Complexity & Trade-offs

Minimal. The `digest` property is present on server-side errors — it's a hash that maps to the full error in server logs without exposing internals to the client. This component doesn't display the digest, but you could log it or show it as a support reference code.

## Patterns Worth Knowing

- **Convention-based error boundaries**: `error.tsx` in a route directory catches errors for that segment and its children.
- **Graceful degradation**: The layout (sidebar, header) remains functional. Only the content area shows the error state.

## Interview Questions

**Q: Why does error.tsx need to be a client component?**
A: React Error Boundaries use `componentDidCatch` and `getDerivedStateFromError`, which are class component lifecycle methods. They only run on the client. Next.js requires `'use client'` on error.tsx to make this work.

**Q: What does the `reset` function actually do?**
A: It clears the error boundary state and re-renders the children. For server components, this means re-executing the data fetch. It's the framework's way of giving users a retry mechanism without a full page reload.

**Q: What's the `digest` property?**
A: When a server component throws, Next.js creates a hash of the error and sends only that hash to the client (for security — you don't want stack traces in the browser). The full error stays in server logs. You can display the digest as a "reference code" for support tickets.

## Data Structures

The error prop follows Next.js convention: `Error & { digest?: string }`.

## Impress the Interviewer

Mention that error boundaries are hierarchical. This `error.tsx` catches errors in `/admin/page.tsx` and any child routes like `/admin/analytics/page.tsx`. But it does NOT catch errors in `layout.tsx` — for that, you'd need an `error.tsx` in the parent directory. Understanding this nesting behavior shows you've actually worked with App Router error handling, not just read about it.
