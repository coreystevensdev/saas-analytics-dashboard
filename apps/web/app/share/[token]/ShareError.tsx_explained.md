# ShareError.tsx — Interview-Ready Documentation

## Elevator Pitch

A small error component for shared insight links that no longer work. It handles two cases — the link doesn't exist, or it's expired — and shows an appropriate message with a button to go to the homepage. It's a data-driven variant component: you pass in which error type, and it picks the right copy.

## Why This Approach

Error states for shared links are predictable: either the link is wrong (404) or it's past its expiration (410 Gone). Rather than two separate components or a free-form error message, a `VARIANTS` lookup object maps each error type to its title and description. This keeps the component small and makes it easy to add new variants later (e.g., `'revoked'`) without changing the rendering logic.

The component is a Server Component (no `'use client'` directive), so it renders as static HTML with zero JavaScript. That's appropriate for an error page — there's nothing interactive except a link.

## Code Walkthrough

```typescript
const VARIANTS = {
  'not-found': {
    title: "This shared insight doesn't exist",
    message: 'The link may have been removed or the URL is incorrect.',
  },
  expired: {
    title: 'This shared insight has expired',
    message: 'Shared links are available for a limited time. Ask the sender for a new link.',
  },
} as const;
```

`as const` makes the object deeply readonly and preserves literal types. The `keyof typeof VARIANTS` prop type is then `'not-found' | 'expired'` — you can't pass an invalid variant.

```typescript
export default function ShareError({ variant }: { variant: keyof typeof VARIANTS }) {
  const { title, message } = VARIANTS[variant];
  ...
}
```

Destructure the variant's content and render it. The link uses Next.js `<Link>` for client-side navigation to the homepage.

## Complexity & Trade-offs

Minimal complexity. The `VARIANTS` pattern scales linearly — add a key, add the copy, done. The trade-off is that all variants share the same layout. If you needed one variant to have a retry button and another to have a different CTA, you'd need to extend the variant data structure or switch to conditional rendering.

## Patterns Worth Knowing

- **Variant lookup object** — Instead of `if/else` chains or switch statements, a plain object maps variant keys to content. TypeScript's `keyof typeof` derives the allowed keys automatically.
- **`as const` for literal types** — Without it, `VARIANTS['not-found'].title` is typed as `string`. With it, it's typed as the literal `"This shared insight doesn't exist"`. More precise types, and the compiler catches typos in variant keys.

## Interview Questions

**Q: Why use a lookup object instead of a switch statement?**
A: The lookup object separates data from logic. The rendering logic is the same for both variants — only the text changes. A switch statement would duplicate the JSX for each case. If you later add a variant, the lookup approach requires adding one object entry. The switch approach requires adding a full case block with duplicated JSX.

**Q: How would you handle a third variant that needs a different CTA button?**
A: Extend the variant type to include an optional `cta` field with `{ label: string; href: string }`, and render it conditionally. Or, if variants diverge significantly, switch to a pattern where each variant is a separate component and this file becomes a dispatcher.

## Data Structures

```typescript
{ variant: 'not-found' | 'expired' }
```

That's the entire API surface. The variant key selects from a static lookup.

## Impress the Interviewer

It's a small component, but the `as const` + `keyof typeof` pattern is worth calling out in an interview. It's a zero-runtime type safety technique — the compiler prevents you from passing `'notfound'` (typo) or `'unknown'` without any runtime validation code. The types are derived from the data, not declared separately. That means you can't forget to update a type when you add a variant.
