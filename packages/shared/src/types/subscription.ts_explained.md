# subscription.ts — Interview-Ready Documentation

## Elevator Pitch

A single type alias: `SubscriptionTier = 'free' | 'pro'`. That's it. This is the simplest possible representation of the billing tier, used throughout the app wherever code needs to branch on whether a user has paid.

## Why This Approach

This type exists separately from the Zod schema (`subscriptionStatusSchema.tier`) because some code paths only need the tier string, not the full status object. A union type is lighter than importing Zod — it's a compile-time-only construct with zero runtime cost.

## Code Walkthrough

```typescript
export type SubscriptionTier = 'free' | 'pro';
```

One line. Used in function signatures like `function getWordLimit(tier: SubscriptionTier): number` and in component props like `{ tier: SubscriptionTier }`.

## Complexity & Trade-offs

Zero complexity. The trade-off: if a third tier is added (say `'enterprise'`), you update this file and the Zod enum in `schemas/subscriptions.ts` separately. They could drift. In practice, adding a pricing tier is a big product decision that touches many files — this one is the least of your worries.

## Interview Questions

**Q: Why not just use the string literal `'free' | 'pro'` inline everywhere?**
A: A named type is a single point of change. If you add `'enterprise'`, you update one file and TypeScript flags every place that doesn't handle the new case. Inline literals mean hunting through every file.

## Data Structures

`'free' | 'pro'` — a TypeScript string literal union.

## Impress the Interviewer

Small types like this are easy to overlook, but they matter for maintainability. The named type turns `tier: string` (could be anything) into `tier: SubscriptionTier` (exactly two legal values). TypeScript's exhaustiveness checking then ensures every `switch` or `if` handles both cases. If you add a tier and forget to update a switch, the compiler tells you. That's the value of a one-line file.
