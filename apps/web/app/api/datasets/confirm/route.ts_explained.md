# route.ts — Dataset Confirmation BFF Proxy

## Elevator Pitch

This proxy forwards a multipart file upload (the confirmed CSV) from the browser to Express for parsing and storage. The interesting parts: it streams the request body without buffering the entire file in memory, and it forwards `Set-Cookie` headers from the Express response back to the browser — something no other proxy route in this project needs to do.

## Why This Approach

CSV files can be large. If the proxy buffered the entire file into memory before forwarding it, you'd double the memory usage for every upload. Instead, this route passes `request.body` (a `ReadableStream`) directly to `fetch`, using the `duplex: 'half'` option that enables streaming request bodies in Node.js.

The `Set-Cookie` forwarding exists because dataset confirmation may trigger session state changes on the backend (like updating the user's last-active timestamp or refreshing a token). Those cookies need to reach the browser, and they can only do that if the proxy explicitly copies them from the upstream response.

## Code Walkthrough

1. **Header extraction** — Both `content-type` and `cookie` are forwarded. The `content-type` is especially important here — it contains the multipart boundary string that Express needs to parse the file upload. If you don't forward it exactly, the upload breaks.

2. **Streaming body forward** — `body: request.body` passes the raw `ReadableStream` to fetch. The `duplex: 'half'` option is required for streaming uploads in the Fetch API — without it, Node.js throws an error. The `as RequestInit` cast is needed because TypeScript's built-in `RequestInit` type doesn't include `duplex` yet.

3. **Response parsing** — The try/catch around `response.json()` handles cases where Express returns a non-JSON response (e.g., if the upload times out and nginx returns an HTML error page).

4. **Status remapping** — Same pattern as the analytics route: `response.status >= 500 ? 502 : response.status`. Express 5xx becomes proxy 502.

5. **Set-Cookie forwarding** — The `for...of` loop over `response.headers.getSetCookie()` is the modern way to handle multiple `Set-Cookie` headers. The older `response.headers.get('set-cookie')` only returns the first one. `getSetCookie()` returns an array of all of them.

## Complexity & Trade-offs

**Streaming vs. buffering** — Streaming keeps memory usage constant regardless of file size. The trade-off: you can't inspect or validate the body in the proxy layer. All validation happens in Express. For a BFF proxy to a trusted internal service, that's acceptable.

**`duplex: 'half'`** — This is a relatively new Fetch API feature. It means the request body can be sent while the response is still being received (half-duplex streaming). Without it, fetch waits for the entire body to be consumed before sending. The TypeScript type cast (`as RequestInit`) is a wart — the types haven't caught up to the spec.

**`getSetCookie()`** — This method exists because the `Set-Cookie` header is the one HTTP header that can't be concatenated with commas (unlike all other headers). `headers.get('set-cookie')` might lose cookies. `getSetCookie()` returns each one separately.

## Patterns Worth Knowing

- **Streaming request body proxy** — `body: request.body, duplex: 'half'` is the pattern for proxying file uploads without buffering. Memorize it — it comes up in any BFF that handles file uploads.
- **Set-Cookie header forwarding** — When proxying responses that set cookies, you have to forward each `Set-Cookie` header individually. This is a common source of bugs in proxy implementations.
- **`export const runtime = 'nodejs'`** — Streaming request bodies require Node.js runtime, not edge. Edge functions have restrictions on request body handling.

## Interview Questions

**Q: Why `duplex: 'half'` and what happens without it?**
A: `duplex: 'half'` enables streaming the request body to the upstream server while potentially receiving the response. Without it, the Fetch API in Node.js throws an error when you pass a `ReadableStream` as the body. It's a requirement of the Streams + Fetch integration spec.

**Q: Why not validate the file in the proxy before forwarding?**
A: Two reasons. First, validation requires reading the entire stream, which defeats the purpose of streaming. Second, Express already validates the file (format, size, column structure). Duplicating that logic in the proxy adds maintenance burden and latency.

**Q: Why use `getSetCookie()` instead of `get('set-cookie')`?**
A: `Set-Cookie` is special in HTTP — it's the only header where multiple values can't be comma-joined (because cookie values can contain commas). `get('set-cookie')` returns a single concatenated string that may be unparseable. `getSetCookie()` returns an array with each cookie separate.

**Q: What's the `as RequestInit` cast about?**
A: TypeScript's built-in `RequestInit` type doesn't include the `duplex` property yet. The runtime supports it, but the types lag behind. The cast tells TypeScript "trust me, this is valid."

## Data Structures

**Request**: Multipart form data containing a CSV file. The `Content-Type` header includes the boundary string (e.g., `multipart/form-data; boundary=----WebKitFormBoundary...`).

**Response from Express**:
```typescript
// Success
{ data: { datasetId: string, rowCount: number, columns: string[] } }

// Error
{ error: { code: string, message: string, details?: unknown } }
```

**Set-Cookie headers**: May include refreshed auth tokens or session updates.

## Impress the Interviewer

Two things to highlight. First, the streaming body pattern — `body: request.body, duplex: 'half'` — shows you understand memory-efficient file handling. Most tutorials buffer the file into a `Buffer` or `FormData` object, which breaks at scale. Second, the `getSetCookie()` usage. Most developers don't know this API exists, and they lose cookies when proxying responses with multiple `Set-Cookie` headers. Mentioning both signals you've dealt with real production proxy issues, not just toy examples.
