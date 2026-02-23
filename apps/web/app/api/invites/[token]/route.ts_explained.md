# route.ts — Invite Token Lookup BFF Proxy

## Elevator Pitch

A BFF proxy that resolves an organization invite by its token. The browser hits `/api/invites/abc123`, this route forwards to Express at `/invites/abc123`, and returns the invite details (org name, inviter, expiry). Two things stand out: no cookies are forwarded (this is a public endpoint), and it uses Next.js 16's async params pattern.

## Why This Approach

Invite links are shared via email or messaging — the recipient may not be logged in yet. That's why this route doesn't forward cookies. It's one of the few unauthenticated BFF proxy routes in the project, which makes sense: you need to see what you're being invited to before you create an account.

## Code Walkthrough

1. **Async params** — Same Next.js 16 pattern as the `[orgId]` route: `params` is a `Promise<{ token: string }>`, so you `await` it before using `token`.

2. **No cookies** — The `request` parameter is prefixed with `_` (unused). No `cookie` header is extracted or forwarded. Express's invite lookup endpoint is public — it validates the token itself (hash comparison, expiry check) without requiring authentication.

3. **No try/catch** — If Express is unreachable, the fetch throws and Next.js returns a generic 500. For an invite lookup page, that's acceptable — the user will just see a loading error and can retry.

4. **Transparent forwarding** — Status codes pass through directly. Express returns 200 for valid tokens, 404 for unknown tokens, 410 for expired tokens. The proxy doesn't remap anything.

## Complexity & Trade-offs

This is the simplest route in the project. No auth, no body, no error handling, no header forwarding beyond the default. The simplicity is the point — invite resolution should be fast and friction-free.

The missing try/catch is a minor gap. For a page that users land on from an email link, a friendlier error message would be better than a raw 500. But it's a low-traffic endpoint and the fix is trivial.

## Patterns Worth Knowing

- **Public BFF routes** — Not every proxy route needs auth. Invite lookups, share page data, and public health checks are legitimate unauthenticated endpoints. The key is that Express decides what's public, not the proxy.
- **Underscore-prefixed unused params** — `_request` signals "I have to accept this parameter (it's part of the function signature) but I don't use it." Standard TypeScript convention.

## Interview Questions

**Q: Why no authentication for invite lookups?**
A: The invite link is the authentication. The token is a secret shared via email. If you have the token, you can see the invite details. Requiring login first would break the onboarding flow — new users don't have accounts yet.

**Q: How is the token secured if there's no auth?**
A: Express stores hashed tokens (like password hashes), not raw tokens. The lookup hashes the incoming token and compares. This means even if the database leaks, the tokens are unusable. There's also an expiry check.

**Q: What HTTP status codes would Express return?**
A: 200 for valid invites, 404 for unknown tokens, 410 (Gone) for expired invites. The discriminated status codes let the frontend show different UI states — "invite not found" vs. "invite expired, ask for a new one."

## Data Structures

**URL parameter**:
```typescript
{ token: string }  // the raw invite token from the email link
```

**Express response** (varies by status):
```typescript
// 200 — valid invite
{ data: { orgName: string, inviterName: string, expiresAt: string } }

// 404 — not found
{ error: { code: 'INVITE_NOT_FOUND', message: string } }

// 410 — expired
{ error: { code: 'INVITE_EXPIRED', message: string } }
```

## Impress the Interviewer

Point out that this is deliberately unauthenticated. In a system where every other route forwards auth cookies, a route that intentionally skips auth is a design decision, not an oversight. The invite token *is* the credential. If asked about security, mention token hashing and expiry on the Express side — the proxy doesn't need to worry about it because the security model is in the backend, where it belongs.
