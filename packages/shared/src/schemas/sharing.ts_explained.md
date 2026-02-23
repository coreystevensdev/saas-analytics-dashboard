# sharing.ts — Interview-Ready Documentation

## Elevator Pitch

Three Zod schemas that define the contract for the share-link feature: what the client sends to create a share (`createShareSchema`), what data gets snapshotted (`insightSnapshotSchema`), and what the API returns (`shareResponseSchema`). Living in the `shared` package, these schemas are the single source of truth used by both frontend and API for validation and type inference.

## Why This Approach

When the same data shape needs validation on both sides of a network boundary, you have two options: duplicate the types (and hope they stay in sync), or define them once in a shared package. This project uses Zod schemas in `packages/shared` so the frontend and API both import the same validation logic. Change the schema once, and TypeScript catches mismatches everywhere.

## Code Walkthrough

- **`createShareSchema`** — the request body for creating a share link. Just a `datasetId` (positive integer). Minimal by design — the API looks up everything else (org name, AI summary, chart config) from the dataset.
- **`insightSnapshotSchema`** — captures the state of the insight at share time: org name, date range, AI summary text, and chart configuration. The `chartConfig` is `z.record(z.unknown())` — a loose type because chart configs vary and the share feature just needs to store and replay them.
- **`shareResponseSchema`** — what the API returns: a shareable URL, the raw token (for clipboard copy), and an expiration timestamp.

Each schema has a companion `type` export using `z.infer<>` so you get TypeScript types for free.

## Complexity & Trade-offs

Low complexity. The `chartConfig: z.record(z.unknown())` is the loosest part — it accepts any object. A stricter schema would catch malformed chart configs at validation time, but chart configs are an internal implementation detail that the share feature shouldn't constrain.

## Patterns Worth Knowing

**Zod-inferred types** — `z.infer<typeof schema>` derives a TypeScript type from a Zod schema. You write the validation once and get the type for free. No manual `interface` that can drift from the schema.

**Shared schema package** — a monorepo pattern where validation schemas live in a shared package imported by both frontend and backend. This is the "contract-first" approach to API design.

## Interview Questions

**Q: Why use `z.record(z.unknown())` for chartConfig instead of a stricter schema?**
A: Chart configurations are complex and vary by chart type. The share feature stores and replays them opaquely — it doesn't interpret the config. A strict schema would couple the share feature to every chart type's config shape, creating unnecessary maintenance burden.

**Q: Why define types with `z.infer` instead of writing interfaces?**
A: Single source of truth. If you write an interface separately from the schema, they can drift apart. `z.infer` guarantees the type always matches the runtime validation.

## Data Structures

Three types, all inferred from their schemas:
- `CreateShareInput` — `{ datasetId: number }`
- `InsightSnapshot` — `{ orgName: string; dateRange: string; aiSummaryContent: string; chartConfig: Record<string, unknown> }`
- `ShareResponse` — `{ url: string; token: string; expiresAt: string }`

## Impress the Interviewer

The snapshot approach (capturing AI summary text and chart config at share time) means shared links are stable — they show what the insight looked like when shared, not the current state. If the user uploads new data and the AI summary changes, existing share links still show the original insight. That's a product decision encoded in the data model. In an interview: "Shared links are snapshots, not live views, because the recipient should see what the sender intended to share."
