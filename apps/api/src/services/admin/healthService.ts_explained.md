# healthService.ts — Interview-Ready Documentation

## Elevator Pitch

A system health checker that probes PostgreSQL, Redis, and the Claude AI API in parallel, each with a timeout. Returns a unified health status with latencies and uptime. This powers the admin dashboard's system status panel and could serve as a `/health` endpoint for load balancers.

## Why This Approach

Health checks need to be fast and resilient. If Redis is down, the health endpoint shouldn't hang for 30 seconds waiting for a TCP timeout. The `withTimeout` pattern gives each probe a hard deadline — if a service doesn't respond within 5 seconds, it's reported as "degraded" rather than crashing the entire check.

Running all three probes in parallel via `Promise.all` means the total health check time is bounded by the slowest service (or the timeout), not the sum of all three.

## Code Walkthrough

**`withTimeout(fn, timeoutMs, fallback)`** — A generic timeout wrapper. Creates a `Promise.race` between the actual function and a timer that resolves (not rejects) with the fallback value. This is a key design choice: timeouts don't throw, they degrade gracefully. The caller gets a result either way.

**`checkDatabaseHealth()`** — Runs `SELECT 1` against Postgres and measures latency. The catch block returns `{ status: 'error' }` instead of throwing, so database failure doesn't kill the health check.

**`formatUptime(seconds)`** — Converts `process.uptime()` seconds into a human-readable string like `"3d 4h 12m"`. Exported separately (likely for testing). Skips zero-value segments — you get `"12m"` not `"0d 0h 12m"`.

**`getSystemHealth(timeoutMs)`** — The main function. Kicks off all three probes in parallel with timeout wrappers, collects results, and returns a structured `SystemHealth` object. The default timeout is 5 seconds, but it's parameterizable for testing.

## Complexity & Trade-offs

The `withTimeout` helper resolves on timeout instead of rejecting. This means `Promise.all` never short-circuits — you always get results for all three services. If one of them used `Promise.reject` on timeout, `Promise.all` would fail fast and you'd lose the other services' statuses.

Trade-off: the timeout timer doesn't get cleaned up if the function resolves first. In Node, the `setTimeout` callback will fire after the race is won, but since it just resolves an already-resolved promise, it's harmless. A production-hardened version might use `AbortController`, but the simplicity here is fine for a health check that runs a few times per minute.

## Patterns Worth Knowing

- **Promise.race for timeouts**: The classic pattern. One promise does the work, another is a timer. Whichever resolves first wins. In an interview, mention that this is preferable to `setTimeout` + callback nesting.
- **Graceful degradation**: Services report `'ok'`, `'error'`, or `'degraded'` — they never throw. This means the health endpoint always returns a response, even if every downstream service is down.
- **Parallel probe execution**: `Promise.all` with three independent checks. Total latency = max(individual latencies), not sum.

## Interview Questions

**Q: Why does `withTimeout` resolve instead of reject on timeout?**
A: Because the caller uses `Promise.all`, which rejects on the first rejection. If a timeout rejected, the entire health check would fail instead of reporting which services are healthy and which are degraded. Resolving with a `degraded` fallback keeps the other results intact.

**Q: How would you extend this to include a readiness vs. liveness distinction?**
A: Liveness just checks "is the process running" — always return 200. Readiness checks whether the service can handle requests — that's what `getSystemHealth` does. You'd add two endpoints: `GET /health/live` (always 200) and `GET /health/ready` (200 if all services are ok, 503 if any are degraded/error). Kubernetes uses this distinction for restart vs. traffic decisions.

**Q: What happens if `checkClaudeHealth` takes 10 seconds?**
A: The `withTimeout` wrapper resolves with `{ status: 'degraded', latencyMs: 5000 }` after 5 seconds. The actual Claude check continues running in the background but its result is ignored. The health endpoint returns within the timeout window.

**Q: Why is `formatUptime` exported?**
A: For unit testing. It's a pure function with clear input/output — easy to write table-driven tests for edge cases like 0 seconds, exactly 1 day, etc. Exporting it doesn't leak implementation details since it's a self-contained utility.

## Data Structures

```typescript
type ServiceStatus = { status: 'ok' | 'error' | 'degraded'; latencyMs: number };

type SystemHealth = {
  services: { database: ServiceStatus; redis: ServiceStatus; claude: ServiceStatus };
  uptime: { seconds: number; formatted: string };
  timestamp: string; // ISO 8601
};
```

## Impress the Interviewer

The `withTimeout` function is a deceptively simple piece of infrastructure. It handles the three hardest problems in distributed health checking: (1) bounding latency so one slow service doesn't block the response, (2) degrading gracefully instead of failing fast, and (3) being composable — you can wrap *any* async function with it. If an interviewer asks "how do you handle cascading failures in microservices?", this pattern is a concrete, code-level answer.
