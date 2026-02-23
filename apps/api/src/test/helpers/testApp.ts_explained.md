# testApp.ts — Interview-Ready Documentation

## Elevator Pitch

A factory function that spins up a disposable Express server with the real middleware stack (correlation IDs, JSON parsing, cookies, error handling) on a random port. Each test file calls `createTestApp`, mounts its own routes via a callback, and gets back a live `baseUrl` to hit with HTTP requests. Tear it down in `afterAll` — no shared state between test suites.

## Why This Approach

Integration tests for HTTP APIs need a running server. You have three options:

1. **Supertest** — wraps the Express app without actually binding a port. Fast, but doesn't test real HTTP behavior (connection handling, cookie jars, etc.).
2. **Shared test server** — one server for all tests. Simple, but tests leak state into each other.
3. **Per-suite ephemeral server** — what this file does. Each test file gets its own server on port 0 (OS picks a free port), with only the routes that test file cares about.

Option 3 gives you isolation without mocking. The `setup` callback pattern means the factory doesn't need to know about every route in the app — each test file injects what it needs.

## Code Walkthrough

`createTestApp` takes a single argument: a `setup` function that receives an Express app instance.

The middleware chain mirrors production order:
1. `correlationId` — attaches a request ID (always first, per project rules)
2. `express.json()` — body parsing
3. `cookieParser()` — needed for JWT auth via httpOnly cookies
4. **`setup(app)`** — the test file mounts its routes and any test-specific middleware here
5. `errorHandler` — catches thrown errors and formats the standard `{ error: { code, message } }` response

Then it calls `app.listen(0)` — port 0 tells the OS to pick any available port. The promise resolves once the server is listening, and we read the actual port from `server.address()`.

Returns `{ server, baseUrl, app }` so the caller can make requests to `baseUrl` and close `server` when done.

## Complexity & Trade-offs

**Gained**: True HTTP integration tests with production middleware. No mocking of Express internals. Full isolation between test suites.

**Sacrificed**: Slightly slower than supertest (actual TCP connections). Each test suite pays the ~10ms cost of binding a port. For a project this size, that's negligible.

**Scaling consideration**: If you had 200 test files all creating servers simultaneously, you could exhaust ephemeral ports. In practice, Vitest runs suites sequentially by default, so this doesn't happen.

## Patterns Worth Knowing

**Factory function with callback injection** — the `setup` callback is a lightweight version of the Strategy pattern. The factory controls the lifecycle (create app, add core middleware, start server), but delegates the variable part (routes) to the caller. In an interview, you'd say: "It's inversion of control — the test owns the routes, the factory owns the middleware skeleton."

**Port 0 binding** — `listen(0)` is the standard trick for tests that need a real server without port conflicts. The OS assigns an ephemeral port, and you read it back from `server.address()`.

## Interview Questions

**Q: Why not use supertest instead of a real HTTP server?**
A: Supertest injects requests directly into the Express request handler, bypassing actual TCP. That's fine for unit-testing route logic, but it misses real-world behavior like cookie serialization, content-length headers, and connection keep-alive. Since our auth uses httpOnly cookies, we want the full HTTP stack in play.

**Q: What happens if a test forgets to close the server?**
A: The port stays bound, and if enough tests leak servers, you'll run out of ephemeral ports or get "address in use" errors. That's why the function's JSDoc says "Caller is responsible for closing the server in afterAll." You could add a global teardown hook as a safety net, but explicit cleanup is clearer.

**Q: Why is `errorHandler` added after the setup callback?**
A: Express error handlers must be registered after the routes they catch errors for. If `errorHandler` came before the test routes, thrown errors would bypass it and crash the server. This mirrors the production middleware chain order documented in the project rules.

## Data Structures

The return type is `{ server: http.Server, baseUrl: string, app: express.Express }`. The `AppSetup` type alias is just `(app: express.Express) => void` — a synchronous callback. If you needed async setup (like seeding a database), you'd change this to return a `Promise<void>`.

## Impress the Interviewer

The subtle thing here is that this factory enforces the same middleware ordering as production. Correlation ID first, error handler last — matching the project's documented middleware chain. Tests that use this factory are testing against the real middleware stack, not a simplified version. That means if someone reorders middleware in production, the tests catch behavioral changes. In an interview, say: "The test helper mirrors the production middleware chain, so integration tests validate the actual request pipeline, not an approximation."
