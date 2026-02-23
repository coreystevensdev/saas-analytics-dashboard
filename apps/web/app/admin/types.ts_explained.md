# types.ts — Interview-Ready Documentation

## Elevator Pitch

This file defines the TypeScript interfaces that every admin component shares. It's the contract between the Express API responses and the React admin UI — if these shapes change, the compiler catches it everywhere at once.

## Why This Approach

Centralizing types in one file per feature area (rather than co-locating them in each component) means you have a single source of truth. When the API adds a field to the org response, you update `AdminOrgRow` here and TypeScript tells you every component that needs adjustment. The alternative — inline types or `any` — is a maintenance nightmare once you have more than two consumers.

The re-export of `ServiceStatus` and `SystemHealth` from `shared/types` is worth noting: those types live in the monorepo's shared package because the API also uses them. This file re-exports them so admin components can import everything from `./types` without reaching into `shared/` directly.

## Code Walkthrough

`AdminOrgRow` maps to what `/admin/orgs` returns per organization — counts for members and datasets, the subscription tier (nullable because free orgs may not have a subscription record), and a timestamp string.

`AdminUserRow` has a nested `orgs` array. Each entry carries `orgId`, `orgName`, and `role` — this is the flattened view of the many-to-many `user_orgs` join table. The `isPlatformAdmin` boolean is the user-level flag (separate from org roles).

`AdminStats` holds the three summary numbers that appear in the stat cards at the top of the admin page.

`AnalyticsEventRow` and `AnalyticsEventsMeta` support the paginated analytics events table on the sub-route. The `metadata` field is `Record<string, unknown> | null` — intentionally loose because event metadata varies by event type.

## Complexity & Trade-offs

Almost none. This is a leaf file with no logic — just shape definitions. The one trade-off: these types duplicate what the API returns rather than sharing a single schema from `packages/shared`. That's intentional. The admin API response shapes are internal, not part of the public contract, so coupling them to the shared package would create unnecessary cross-package dependencies.

## Patterns Worth Knowing

- **Feature-local type barrel**: Group related interfaces in one file per feature area. Import as `from './types'`.
- **Re-export from shared**: `export type { ServiceStatus, SystemHealth } from 'shared/types'` gives consumers a single import path while respecting the monorepo boundary.

## Interview Questions

**Q: Why not put these in the shared package?**
A: The shared package holds types that cross the API/web boundary as part of the public contract. Admin response shapes are internal to the admin feature — coupling them to `shared` would force API changes to go through the shared package even when only the admin UI consumes them.

**Q: Why is `subscriptionTier` a `string | null` instead of a union like `'free' | 'pro' | null`?**
A: Pragmatic choice. The API may add tiers later. Using `string` here avoids a front-end redeploy just because a new tier name appeared. The `tierBadge` function in `AdminOrgTable` handles unknown values gracefully by defaulting to "Free."

## Data Structures

```
AdminOrgRow    — one row in the orgs table (id, name, slug, memberCount, datasetCount, subscriptionTier, createdAt)
AdminUserRow   — one row in the users table with nested org memberships
AdminStats     — three aggregate counters (totalOrgs, totalUsers, proSubscribers)
AnalyticsEventRow  — one analytics event with flexible metadata
AnalyticsEventsMeta — pagination envelope (total, page, pageSize, totalPages)
```

## Impress the Interviewer

Mention that the `orgs` array inside `AdminUserRow` is a denormalized view of a many-to-many relationship. In the database, `user_orgs` is a join table with `user_id`, `org_id`, and `role`. The API flattens this into a nested array so the frontend doesn't need to do any joining. This is a common BFF pattern — shape data for the consumer, not the storage model.
