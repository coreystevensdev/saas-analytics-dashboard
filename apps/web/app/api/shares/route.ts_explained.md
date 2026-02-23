# route.ts — Share Creation BFF Proxy

## Elevator Pitch

A BFF proxy for creating shareable links to AI-generated insights. When a user clicks "Share this insight," the browser POSTs to this route, which forwards the request to Express. Express generates a hashed share token and returns the shareable URL.

## Why This Approach

Standard BFF proxy pattern. The share creation endpoint is authenticated (you need to own the insight to share it), so cookies are forwarded. The body is read as raw text with `request.text()` and forwarded without parsing — a simpler approach than the analytics route's JSON parsing.

## Code Walkthrough

1. **Cookie forwarding** — Auth cookies go along to Express so it can verify the user owns the insight being shared.

2. **Raw body forwarding** — `request.text()` reads the body as a string. This is forwarded as-is with an explicit `Content-Type: application/json` header. The route trusts that the body is valid JSON because Express will validate it. No try/catch around the body read — if the body is malformed, Express returns a 400.

3. **Transparent forwarding** — Status code and response body pass through unchanged. No error remapping, no try/catch for network failures.

## Complexity & Trade-offs

This is a thin proxy. The choice to use `request.text()` instead of `request.json()` avoids a parse-then-reserialize cycle. With `request.json()`, you'd parse the JSON into an object, then `JSON.stringify()` it again for the upstream fetch. `request.text()` skips the round-trip — the bytes go through without transformation.

The trade-off: no early validation. If the client sends `{broken json`, the proxy forwards it and Express returns an error. The extra round-trip is cheap (localhost), so this is fine.

## Patterns Worth Knowing

- **`request.text()` for JSON pass-through** — When you don't need to inspect the body, reading it as text and forwarding is more efficient than parsing and re-serializing. Avoids potential floating-point or whitespace changes from JSON round-tripping.
- **POST proxy without body validation** — Acceptable when the upstream is trusted and local. Not acceptable when the upstream is external or untrusted.

## Interview Questions

**Q: Why `request.text()` instead of `request.json()`?**
A: Avoids a needless parse-serialize cycle. The proxy doesn't inspect the body, so there's no reason to parse it into an object. `text()` gives you the raw bytes (as a string) which you forward directly.

**Q: Should this route have error handling for upstream failures?**
A: It's a trade-off. The analytics route has extensive error handling because it's high-volume and loss-sensitive. Share creation is low-volume and user-initiated (they'll see the error and retry). The simpler code is defensible for this use case.

**Q: How does the share link work end-to-end?**
A: User clicks share → browser POSTs to this proxy → Express generates a token, hashes it, stores the hash → returns the shareable URL with the raw token. When someone visits the share URL, a different route looks up the token by hash. The raw token is never stored.

## Data Structures

**Request body**:
```typescript
{ summaryId: string }  // the AI summary to share
```

**Response**:
```typescript
{ data: { shareUrl: string, token: string, expiresAt: string } }
```

## Impress the Interviewer

The `request.text()` choice is a small optimization, but it shows you think about data flow through proxy layers. JSON round-tripping (parse then stringify) can subtly alter data — numbers might gain or lose precision, key order might change. For a pass-through proxy, treating the body as opaque bytes is the right move.
