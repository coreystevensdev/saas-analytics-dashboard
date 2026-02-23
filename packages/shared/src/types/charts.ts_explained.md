# charts.ts — Interview-Ready Documentation

## Elevator Pitch

A type re-export file that derives TypeScript types from Zod schemas defined in `schemas/charts.ts` and `schemas/filters.ts`. Five types — `RevenueTrendPoint`, `ExpenseBreakdownItem`, `DatasetDateRange`, `ChartData`, and `ChartFilters` — all created via `z.infer`. This file exists so consumers can import types without depending on the Zod runtime.

## Why This Approach

Zod schemas live in `schemas/`. Types derived from those schemas live in `types/`. This separation lets code that only needs types (like React components doing type annotations) import from `types/` without pulling in Zod as a runtime dependency. It's a monorepo hygiene pattern — keep runtime validation separate from compile-time types.

## Code Walkthrough

Each line follows the same pattern:
```typescript
export type RevenueTrendPoint = z.infer<typeof revenueTrendPointSchema>;
```

The `z.infer` utility extracts the TypeScript type from a Zod schema. The schemas themselves (imported from `../schemas/charts.js` and `../schemas/filters.js`) define the runtime validation rules. This file just re-exports the derived types.

## Complexity & Trade-offs

Zero logic, zero complexity. The trade-off is an extra file to maintain — when you add a new chart schema, you add a corresponding type export here. That's a minor inconvenience for cleaner import boundaries.

## Patterns Worth Knowing

**Schema-first type derivation** — define the Zod schema, derive the type. Never write the type by hand. This guarantees types and validation can't drift apart.

## Interview Questions

**Q: Why not just export the types from the schema files directly?**
A: You could, and some projects do. The separation here is about import ergonomics in a monorepo. A React component that just needs `ChartData` for a prop type shouldn't transitively import Zod. Separate `types/` files give you tree-shakeable, runtime-free imports.

**Q: What do these types represent in the application?**
A: `RevenueTrendPoint` is a single data point on the revenue line chart (date + amount). `ExpenseBreakdownItem` is a slice of the expense pie chart (category + amount). `DatasetDateRange` is the min/max date range of a dataset. `ChartData` bundles them together. `ChartFilters` represents the active filter state (date range, category selection).

## Data Structures

All five types are inferred from their respective Zod schemas. The actual shape is defined in `schemas/charts.ts` and `schemas/filters.ts` — this file is purely a re-export layer.

## Impress the Interviewer

This pattern — thin type files that re-export `z.infer` types — is common in production monorepos but rarely taught. It shows you understand the difference between runtime dependencies (Zod) and compile-time dependencies (TypeScript types), and you organize code so consumers can choose which they need.
