# analytics/page.tsx — Interview-Ready Documentation

## Elevator Pitch

A thin page component that renders the analytics events sub-route at `/admin/analytics`. It sets the heading and mounts the `AnalyticsEventsTable` component. The real logic lives in the table component — this file is just the route entry point.

## Why This Approach

Next.js App Router requires a `page.tsx` for each route segment. This file exists because `/admin/analytics` needs to be a navigable route. Keeping it thin follows the "page as composition root" pattern — the page picks which components to render, the components own their data fetching and state.

## Code Walkthrough

The default export renders a div with responsive padding (`p-4 md:p-6 lg:p-8` — same spacing used across the admin section), a heading, and the `AnalyticsEventsTable` client component. That's it.

Note the import path: `'../AnalyticsEventsTable'` — the table component lives in the parent `/admin` directory, not inside `/analytics`. This means other admin routes could reuse it if needed.

## Complexity & Trade-offs

Nearly zero. This is a server component (no `'use client'` directive), which means it renders on the server with zero JavaScript shipped for the page shell itself. The `AnalyticsEventsTable` is a client component that handles its own data fetching via SWR.

## Patterns Worth Knowing

- **Page as composition root**: Pages wire together components but contain no business logic.
- **Server component by default**: No `'use client'` means this renders on the server. Only the interactive table component adds client-side JS.

## Interview Questions

**Q: Why is this a server component if it renders a client component?**
A: Server components can render client components — the boundary is at the `'use client'` directive in the child. The page itself ships zero JS. Only `AnalyticsEventsTable` (and its dependencies) get bundled for the client.

## Data Structures

None. Pure compositional component.

## Impress the Interviewer

This file is intentionally boring, and that's the point. In a well-structured App Router project, page files should be thin composition roots. If you see business logic, data transformation, or complex state in a page file, that's a smell. The discipline to keep pages dumb pays off when routes multiply.
