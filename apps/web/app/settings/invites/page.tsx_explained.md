# InvitesPage — Interview-Ready Documentation

## Elevator Pitch

A settings page where org owners can invite new team members. Like the invite accept page, it's a thin server component wrapper around `InviteManager` — a client component that handles the invite form, pending invite list, and revocation.

## Why This Approach

Same pattern as the invite accept page: server component for metadata, client component for interactivity. There are no dynamic route params here, so the page is even simpler — just a layout shell with a centered card.

## Code Walkthrough

- **`metadata`**: Static page title for browser tab and SEO.
- **`InviteManager`**: Client component that contains the invite form (email input, role selector), list of pending invites, and revoke functionality. All the business logic lives there.
- **Layout**: `min-h-screen` with flexbox centering — the invite manager card floats in the middle of the viewport.

## Complexity & Trade-offs

Minimal. This is boilerplate App Router page structure. The trade-off of having a separate `InviteManager` component is one more file, but it keeps the page exportable as a server component with static metadata.

## Patterns Worth Knowing

- **Settings page pattern**: Settings subpages in this app follow a consistent structure — server component page with metadata, single client component for the UI. It makes the settings section easy to reason about.

## Interview Questions

**Q: Could you combine this page and InviteManager into one file?**
A: Technically yes with `'use client'` at the top, but you'd lose the ability to export `metadata` (server-only API). The two-file split is the idiomatic App Router approach.

**Q: How is this page protected?**
A: The BFF proxy (`proxy.ts`) protects `/settings/*` routes. Only authenticated users with the right org role can reach this page. The page itself doesn't check auth — that's handled at the proxy layer.

## Data Structures

No data structures in this file — it's pure layout delegation.

## Impress the Interviewer

Point out the consistency: every page in this app follows the same server-component-wrapper pattern. That kind of structural consistency across a codebase matters more than clever tricks in any single file. It means any developer can open any page and immediately know where to look for logic (the client component) versus layout/metadata (the page file).
