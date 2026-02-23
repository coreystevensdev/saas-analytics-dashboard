# AdminOrgTable.tsx — Interview-Ready Documentation

## Elevator Pitch

A client component that renders all organizations in a data table for platform admins. It displays each org's name, slug, member count, dataset count, subscription tier (as a colored badge), and creation date. The component receives data as props — it doesn't fetch anything itself.

## Why This Approach

This is a "dumb" presentational component. It takes an array of `AdminOrgRow` objects and renders them. The data fetching happens in the server component (`page.tsx`) that passes the array down. This separation means you can test the table in isolation, reuse it in different contexts, and keep the rendering logic free of async concerns.

The `tierBadge` helper is a standalone function rather than a separate component because it has no state, no hooks, and no props beyond a single string. Making it a component would add ceremony without benefit.

## Code Walkthrough

**`tierBadge(tier)`** — Returns a styled `<span>` based on whether the tier is `'pro'` or anything else. Pro gets a primary-colored badge; everything else (including `null`) defaults to a muted "Free" badge. This gracefully handles unknown tiers — if the backend adds a "growth" tier tomorrow, users see "Free" until the UI is updated.

**`AdminOrgTable({ orgs })`** — Renders a Card containing a Table with six columns. A few details worth noting:

- `fontFeatureSettings: '"tnum"'` on numeric cells enables tabular numbers, so digits align vertically across rows. Without this, proportional numbers make columns look ragged.
- The `dateFmt.format()` call uses the shared formatter from `formatters.ts` — one `Intl.DateTimeFormat` instance for all date rendering.
- The empty state (`orgs.length === 0`) renders a single row spanning all columns. This prevents the table from collapsing to just headers.
- The slug column uses `font-mono text-xs` — monospace for technical identifiers is a common UX convention.

## Complexity & Trade-offs

**Gained**: Pure presentational component with zero side effects. Easy to test, easy to reason about.

**Sacrificed**: No sorting, filtering, or pagination. For a platform admin viewing maybe a few hundred orgs, this is fine. If the table needed to handle thousands of rows, you'd add server-side pagination (the API already supports it for analytics events) or a virtualized list.

**No search**: If an admin is looking for a specific org, they use browser Ctrl+F. That works until you add pagination, at which point you need server-side search.

## Patterns Worth Knowing

- **Presentational/container split**: The table renders data, the page fetches it. This is the React equivalent of separating the view from the controller.
- **Tabular numbers (`tnum`)**: A font feature that makes all digits the same width. Columns of numbers align neatly without monospace fonts.
- **Graceful tier handling**: The `tierBadge` function defaults unknown tiers to "Free" rather than crashing or showing `null`.

## Interview Questions

**Q: Why is this a client component (`'use client'`) if it has no interactivity?**
A: It uses shadcn/ui table components which may use client-side features internally. The `'use client'` directive marks the boundary — this component and everything it imports run on the client. In practice, for a static table like this, you could potentially make it a server component, but the shadcn table primitives expect client rendering.

**Q: What's the purpose of `fontFeatureSettings: '"tnum"'`?**
A: It activates tabular figures — fixed-width digits. In a table column showing numbers like 12, 1,847, and 3, the digits align vertically. Without `tnum`, proportional figures make 1s narrower than 8s, which looks messy in a column.

**Q: How would you add sorting to this table?**
A: For client-side sorting (small datasets), you'd add state for the sort column and direction, then sort the `orgs` array before mapping. For server-side sorting (large datasets), you'd lift the sort state up, pass it as a query parameter to the API, and have the server return sorted results. Libraries like TanStack Table handle both patterns.

**Q: Why a function instead of a component for `tierBadge`?**
A: It's a pure function that takes a string and returns JSX. No hooks, no state, no lifecycle. Making it a component (`<TierBadge tier={...} />`) adds a component boundary in the React tree for no benefit. Functions are simpler when you don't need React's component features.

## Data Structures

```
AdminOrgRow {
  id: number
  name: string
  slug: string
  memberCount: number
  datasetCount: number
  subscriptionTier: string | null
  createdAt: string          // ISO date string from the API
}
```

The component receives `AdminOrgRow[]` — a flat array, no nesting, no pagination metadata.

## Impress the Interviewer

Talk about the `tnum` font feature setting. Most developers never think about number alignment in tables, but it's one of those details that makes a data-heavy UI look professional vs. amateurish. It works with most modern fonts (Inter, system fonts) without needing a monospace font for the whole cell. Knowing about OpenType features in CSS shows you've built real data UIs, not just tutorial apps.
