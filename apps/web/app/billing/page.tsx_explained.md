# billing/page.tsx — Interview-Ready Documentation

## Elevator Pitch

The billing page wrapper. It provides the page-level layout (centered container, heading) and renders the `BillingContent` client component inside it. The page itself is a Server Component — no `'use client'` directive.

## Why This Approach

This is the Server Component / Client Component boundary pattern. The page handles structure and static content (the `<h1>` heading, the centering layout). The interactive billing logic — subscription fetching, Stripe redirects, loading/error states — lives in `BillingContent`, which is a Client Component.

The split means the heading and layout render as static HTML on the server. Only `BillingContent` ships JavaScript to the browser. If the page were entirely a Client Component, the heading would need JS to render too — wasteful for static text.

## Code Walkthrough

```typescript
export default function BillingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center px-4 pt-12">
      <div className="w-full max-w-[640px]">
        <h1 className="mb-8 text-2xl font-semibold tracking-tight">Billing</h1>
        <BillingContent />
      </div>
    </main>
  );
}
```

Standard centered single-column layout. `max-w-[640px]` caps the content width for readability. `min-h-screen` ensures the background fills the viewport even if content is short.

No `metadata` export here — the billing page doesn't need custom OG tags or title overrides (the root layout's title suffices, or it could be added later).

## Complexity & Trade-offs

Trivial complexity. This is a thin wrapper, and that's the correct level of responsibility for a page file in App Router. Pages should be composition points, not containers for business logic.

## Patterns Worth Knowing

- **Page as composition root** — The page file imports and arranges components. It doesn't contain state, effects, or event handlers. This keeps the page file readable as a "table of contents" for what appears on screen.

## Interview Questions

**Q: Why not put the heading inside `BillingContent`?**
A: The heading is static text — it never changes and needs no JavaScript. Keeping it in the Server Component page means it renders as plain HTML. It's a small optimization, but the principle scales: keep static content in Server Components, push interactivity to the smallest possible Client Component boundary.

## Data Structures

None.

## Impress the Interviewer

Not much to say about a 12-line file, but the pattern matters. In a well-structured App Router codebase, page files are boring on purpose. If your page file is exciting, you probably have business logic in the wrong place.
