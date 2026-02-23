# AdminUserTable.tsx — Interview-Ready Documentation

## Elevator Pitch

A client component that displays all platform users in a table for admins. Each row shows the user's name, email, org memberships (with roles), and creation date. Platform admins get a shield icon next to their name — a quick visual scan tells you who has elevated access.

## Why This Approach

Same presentational pattern as `AdminOrgTable` — data in, JSX out. The interesting part is how it handles the many-to-many relationship between users and organizations. Each user can belong to multiple orgs with different roles, so the `orgs` field is an array that gets rendered as a set of inline badges.

The ShieldCheck icon from Lucide communicates admin status without adding a column. It's inline with the name, which keeps the table compact. The `aria-label` on the icon means screen readers announce "Platform admin" — sighted users see the icon, non-sighted users hear the label.

## Code Walkthrough

**Name column**: Wraps the name and an optional ShieldCheck icon in a flex container with `gap-1.5`. The icon only renders when `user.isPlatformAdmin` is true. The icon size (`h-3.5 w-3.5`) is deliberately small — it's a subtle indicator, not a focal point.

**Organizations column**: This is the most interesting cell. It handles three states:
1. User has no orgs — shows "No org" in muted text.
2. User has orgs — renders each as a pill badge with the org name and role in parentheses.
3. Multiple orgs — badges wrap naturally with `flex-wrap gap-1`.

The role is shown in muted text inside the badge (e.g., "Acme Corp (owner)"). This leverages the denormalized `orgs` array from the API, which flattens the `user_orgs` join table.

**Empty state**: Same pattern as the org table — a `colSpan={4}` row with centered text.

## Complexity & Trade-offs

**Gained**: The nested org badges give admins a complete picture of each user's access at a glance. No need to cross-reference a separate org-members view.

**Sacrificed**: If a user belongs to 20 orgs, the badges would overflow the cell. For this SaaS product targeting small businesses, users typically belong to 1-3 orgs, so this isn't a real concern. If it were, you'd truncate to the first 3 and show a "+N more" badge.

**No actions**: There's no "ban user" or "promote to admin" button. This is a read-only dashboard. Admin actions would go through a separate workflow (API endpoints, confirmation modals) — not inline table buttons where a misclick could be expensive.

## Patterns Worth Knowing

- **Inline role indicators**: The ShieldCheck icon + aria-label pattern adds information density without adding columns. Common in admin UIs and user lists.
- **Badge wrapping for arrays**: Using `flex-wrap` with small badges is a clean way to display variable-length arrays in table cells.
- **Denormalized display**: The API flattens the join table so the frontend doesn't need to do any data joining. This is a BFF (Backend For Frontend) pattern.

## Interview Questions

**Q: How does the component handle the many-to-many user-to-org relationship?**
A: The API denormalizes it — each `AdminUserRow` has an `orgs` array with `{ orgId, orgName, role }` objects. The component just maps over this array to render badges. No client-side joins needed.

**Q: Why use an icon instead of a column for admin status?**
A: Column real estate is expensive in tables. Most users aren't admins, so a dedicated column would be empty 95% of the time. An inline icon conveys the same information without wasting horizontal space.

**Q: How would you make this table searchable?**
A: Add an input above the table that filters the `users` array by name or email using `String.includes()` or a fuzzy matcher. For large user bases, move the filtering to the server — add a `?search=` query param to the API endpoint and re-fetch on input change (debounced).

**Q: What accessibility consideration does the ShieldCheck icon address?**
A: The `aria-label="Platform admin"` makes the icon's meaning available to screen readers. Without it, a screen reader would either skip the icon entirely or announce "image" with no context. The icon also uses the `text-primary` color which has sufficient contrast against the background.

## Data Structures

```
AdminUserRow {
  id: number
  email: string
  name: string
  isPlatformAdmin: boolean
  orgs: Array<{
    orgId: number
    orgName: string
    role: string           // "owner" | "member"
  }>
  createdAt: string
}
```

The nested `orgs` array is the flattened representation of the `user_orgs` join table. Each entry carries the org's display name so the frontend doesn't need a second lookup.

## Impress the Interviewer

Mention the two-dimensional RBAC model this table visualizes. `isPlatformAdmin` is a user-level boolean — it's about platform access (can you see this admin panel?). The `role` inside each org membership is about org-level permissions (can you upload data? manage members?). These are orthogonal. A platform admin might be a "member" in an org, and an org "owner" is not necessarily a platform admin. This separation keeps the permission model clean and avoids the common mistake of conflating application-level and resource-level access.
