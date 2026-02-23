# datasets.ts — Interview-Ready Documentation

## Elevator Pitch

Type re-exports for the dataset domain — seven types derived from Zod schemas in `schemas/datasets.ts`. Covers the full data ingestion lifecycle: source type, demo mode state, dataset metadata, individual data rows, and CSV validation errors. Same pattern as `charts.ts` — schema-first types with clean import boundaries.

## Why This Approach

Same rationale as `types/charts.ts`: keep runtime validation (Zod schemas) separate from compile-time types. Frontend components that render a dataset list or show validation errors import from here without pulling in Zod.

## Code Walkthrough

Seven `z.infer` re-exports:

- **`SourceType`** — `'csv'` or `'api'`, distinguishing user-uploaded CSVs from Growth-tier API integrations.
- **`DemoModeState`** — one of `'seed_only' | 'seed_plus_user' | 'user_only' | 'empty'`. Controls which data the dashboard shows (seed data, user data, both, or nothing).
- **`Dataset`** — metadata for an uploaded dataset: id, name, org, row count, timestamps.
- **`DataRow`** — a single row of ingested data: date, amount, category, optional label/parent_category.
- **`ColumnValidationError` / `CsvValidationError` / `CsvPreviewData`** — error and preview types for the upload flow. When a CSV has issues, the frontend shows per-column and per-row errors so users can fix their file.

## Complexity & Trade-offs

No logic. The trade-off is the same as all type re-export files: one more file to update when schemas change. The benefit is that frontend code doesn't depend on Zod at runtime.

## Patterns Worth Knowing

**Domain-organized type modules** — types are grouped by domain (datasets, charts, subscriptions), not by technical layer. This makes imports intuitive: "I'm working on datasets, so I import from `types/datasets`."

## Interview Questions

**Q: What's the `DemoModeState` type for?**
A: It's a 4-state machine that controls the dashboard's data source. `seed_only` shows pre-loaded demo data, `seed_plus_user` blends demo and uploaded data, `user_only` shows only the user's uploads, and `empty` shows the empty state with an upload prompt. This lets new users see a working dashboard immediately while transitioning to their own data.

**Q: Why separate `ColumnValidationError` and `CsvValidationError`?**
A: They're at different granularities. `ColumnValidationError` is about a single column in a single row ("amount in row 5 is not a number"). `CsvValidationError` is about the file as a whole ("missing required column: date"). The upload UI shows them differently — file-level errors block the upload, row-level errors allow partial ingestion.

## Data Structures

All seven types are inferred from `schemas/datasets.ts`. See that file for the actual shapes.

## Impress the Interviewer

The `DemoModeState` type is worth calling out. Most dashboards show either demo data or real data. This project has a 4-state machine that handles the transition between them, including a blended state (`seed_plus_user`) for users who've uploaded some data but not enough to fill all charts. That kind of state modeling shows product thinking, not just technical execution.
