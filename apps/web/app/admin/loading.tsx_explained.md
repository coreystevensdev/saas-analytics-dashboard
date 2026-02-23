# loading.tsx — Interview-Ready Documentation

## Elevator Pitch

A skeleton loading screen that Next.js App Router shows automatically while the admin page's server component fetches data. It mirrors the real page layout — stat cards, a table — so the transition feels seamless rather than jarring.

## Why This Approach

Next.js App Router uses `loading.tsx` as a built-in Suspense boundary. When you navigate to `/admin`, React streams the layout immediately and shows this skeleton until the async `page.tsx` resolves. No loading state management, no `useState(true)` — the framework handles it.

The skeleton matches the page structure (heading, three stat cards, a table with four rows) so users see a stable layout that doesn't shift when real content arrives. This is called "content-aware skeleton" vs a generic spinner.

## Code Walkthrough

`SkeletonBar` is a small helper that renders a pulsing gray rectangle. The `animationDuration` and `animationTimingFunction` overrides slow down the default Tailwind pulse to feel less frantic.

`AdminLoading` composes these bars into the same grid the real page uses: an `h-8` bar for the title, a 3-column grid of Cards for stats, then a Card with four `h-10` rows mimicking a data table.

## Complexity & Trade-offs

Very low complexity. The trade-off: if the real page layout changes (say, four stat cards instead of three), the skeleton needs a manual update. There's no programmatic link between them. In practice, admin layouts change rarely enough that this isn't a real cost.

## Patterns Worth Knowing

- **Convention-based Suspense**: `loading.tsx` in App Router is automatic — no explicit `<Suspense>` wrapper needed.
- **Content-aware skeletons**: Match the skeleton to the real layout to prevent Cumulative Layout Shift (CLS).

## Interview Questions

**Q: How does Next.js know to show this component?**
A: The App Router wraps each route segment's `page.tsx` in a `<Suspense>` boundary automatically. If a `loading.tsx` file exists in the same directory, it becomes the fallback. When the server component in `page.tsx` awaits data, React streams this skeleton first.

**Q: Why not use a spinner instead?**
A: Skeletons that match the page layout prevent layout shift and give users a sense of what's coming. A spinner communicates "something is loading" but gives no structural preview. Skeletons are better for perceived performance.

## Data Structures

None. Pure presentational component.

## Impress the Interviewer

The custom `animationDuration: '1500ms'` is a small UX detail worth mentioning. The default Tailwind `animate-pulse` runs at 2s with a linear feel. Adjusting to 1500ms with `ease-in-out` creates a more organic breathing effect. Small polish like this separates "I dropped in a skeleton" from "I thought about the loading experience."
