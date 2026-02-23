# auth-utils — Interview-Ready Documentation

## Elevator Pitch

A single utility function that extracts the `isAdmin` claim from a JWT without verifying the signature. Used on the client side (or in server components that already trust the token) to conditionally show admin UI — not for authorization decisions.

## Why This Approach

`decodeJwt` from `jose` does base64 decoding only — no signature verification. That's intentional here. The server already verified the JWT before setting the cookie. The client just needs to peek at claims for UI gating (show/hide admin links). Actual authorization happens server-side on every request.

If you used `jwtVerify` instead, you'd need the JWT secret on the client, which defeats the purpose of a secret. `decodeJwt` is the right tool for "read claims, don't trust them for security."

## Code Walkthrough

- **`extractIsAdmin(token)`**: Takes an optional string (the JWT might not exist if the user isn't logged in).
- **Guard clause**: `if (!token) return false` — no token means not admin.
- **`decodeJwt(token)`**: Parses the JWT payload without verification. Returns the claims object.
- **Strict boolean check**: `claims.isAdmin === true` — not truthy check. If someone sets `isAdmin: "yes"` or `isAdmin: 1`, this returns `false`. Defensive against type confusion.
- **`catch` returns `false`**: Malformed tokens (not valid base64, not valid JSON) get swallowed. You're not an admin if your token is garbage.

## Complexity & Trade-offs

Very low complexity. The trade-off: you're trusting that the server set the claim correctly, and you're not catching or logging decode errors. That's fine for UI gating — the worst case is an admin doesn't see the admin link and has to navigate directly.

## Patterns Worth Knowing

- **Decode vs. verify**: JWTs have three parts (header.payload.signature). `decodeJwt` reads the payload. `jwtVerify` checks the signature. Client-side code should only decode; server-side code must verify.
- **UI gating vs. authorization**: Showing/hiding a button based on a claim is UI gating. The server must still check permissions on every request. Never rely on client-side JWT checks for security.

## Interview Questions

**Q: Is it safe to decode a JWT without verifying the signature?**
A: For UI display, yes. The JWT payload is just base64-encoded JSON — anyone can read it. The signature protects against *tampering*, which matters server-side. The client reads claims for UX decisions (show admin panel link), but the server re-verifies on every API call.

**Q: Why `=== true` instead of just checking truthiness?**
A: Type safety. JWT claims are `unknown` by default. A truthy check would accept `"true"`, `1`, or any non-empty string. Strict equality ensures the claim is actually the boolean `true`.

**Q: Why not use a library like `jwt-decode` instead of `jose`?**
A: The project already uses `jose` for server-side JWT operations (signing, verifying). Using `decodeJwt` from the same library avoids adding another dependency for the same task.

## Data Structures

```typescript
// JWT claims (partial — only what this function cares about)
interface JWTPayload {
  isAdmin?: boolean;
  // ...other claims (sub, orgId, exp, etc.)
}
```

## Impress the Interviewer

The key insight: this function is *intentionally* insecure for its context. An interviewer might raise an eyebrow at "decode without verify," and that's your opening to explain the difference between UI gating and authorization. The security boundary is the server — the client just needs to know what buttons to show. If you can articulate that distinction clearly, you're demonstrating real understanding of JWT-based auth architecture.
