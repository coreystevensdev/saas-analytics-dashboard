# ci.yml — Interview Companion

## Elevator Pitch

A 5-stage GitHub Actions pipeline that gates every push and PR against progressively deeper checks: static analysis → unit tests → seed data validation → E2E tests → Docker smoke test. Each stage depends on the previous one, so expensive checks only run if cheaper ones pass first. The pipeline catches type errors, test regressions, data pipeline bugs, UI breakage, and Docker build failures — all before code reaches `main`.

## Why This Approach

The stages are ordered by cost and speed. Linting takes seconds and catches syntax errors. Unit tests take a few seconds and catch logic errors. Seed validation takes under a second and catches curation pipeline regressions. E2E takes minutes (Docker build + browser tests) and catches integration failures. The smoke test catches broken Dockerfiles.

**What's happening:** Five jobs in a dependency chain, cheapest first.
**How to say it:** "We use a fail-fast pipeline — static analysis gates unit tests, which gate integration tests, which gate E2E. A type error doesn't waste 10 minutes of Docker build time."

This is a monorepo with three workspaces (api, web, shared), so each stage needs to install dependencies and build. Turborepo caches build outputs between workspaces, which keeps the Node-based stages fast.

## Code Walkthrough

### Stage 1: `quality` — Lint & Type Check
The pre-existing stage from Story 1.6. Runs `pnpm turbo lint` and `pnpm turbo type-check` across all workspaces. Uses `pnpm/action-setup@v4` with version pinning and `actions/setup-node@v4` with pnpm cache enabled. The `--frozen-lockfile` flag prevents accidental dependency drift in CI.

### Stage 2: `test` — Unit & Integration Tests
Depends on `quality`. Runs `pnpm turbo test`, which triggers Vitest across all three workspaces. The API workspace runs in Node environment, the web workspace in jsdom with React plugin. No Docker services needed — all tests use mocks.

### Stage 3: `seed-validation` — Seed Data Validation
Depends on `test`. Runs the seed validation script via `pnpm -C apps/api exec tsx` — this uses the api workspace's tsx dependency to execute a script at the monorepo root. The script imports curation pipeline functions individually (avoiding the barrel import trap) and asserts 2+ distinct stat types in the assembled prompt. Zero cost — no API calls.

### Stage 4: `e2e` — E2E Tests
Depends on `seed-validation`. The most complex stage:
1. Installs Playwright + Chromium with system deps
2. Copies `.env.ci` to `.env` (Docker Compose reads `env_file: .env`)
3. Builds and starts all 4 Docker Compose services
4. Waits for API health (`/health` endpoint) and web app (port 3000) with retry loops
5. Runs Playwright tests against the live stack
6. Tears down Docker Compose (`if: always()` ensures cleanup on failure)

The wait steps use retry loops with `curl` — not `sleep` — so they proceed as soon as services are ready. Failure dumps Docker logs for debugging.

### Stage 5: `docker-smoke` — Docker Smoke Test
Depends on `e2e`. Runs `scripts/smoke-test.sh`, which does its own `docker compose up`, health check, and teardown. This is distinct from E2E — it validates that a *clean* Docker build produces healthy containers, separate from whether the app's UI works correctly.

## Complexity / Trade-offs

**Sequential stages vs parallel.** The pipeline is fully sequential. In a larger team you'd parallelize independent checks (lint and test can run simultaneously). Here, sequential is simpler to debug and the total pipeline time is acceptable for a portfolio project.

**`.env.ci` committed to the repo.** Contains dummy values for services not called during CI (Claude API, Stripe, Google OAuth). The real secrets live in GitHub Actions secrets for production deploys. The dummy values are just enough to pass Zod validation at startup.

**Docker Compose in CI (not Actions `services:`).** GitHub Actions has a `services:` key for container dependencies, but it doesn't support the full Compose feature set — custom health checks, init scripts, multi-stage Dockerfiles, volume mounts. Using the same `docker-compose.yml` that developers use locally means CI catches exactly the issues developers would hit.

**Duplicate Docker Compose spin-ups.** Stages 4 and 5 both start Docker Compose. This is intentional — they test different things. Combining them would conflate "does the UI work?" with "does the Docker build work?" and make failures harder to diagnose.

## Patterns Worth Knowing

**`needs:` for job ordering.** GitHub Actions jobs run in parallel by default. The `needs:` key creates a dependency graph. If a job in `needs:` fails, the dependent job is skipped entirely. This is how fail-fast works — no explicit "cancel on failure" logic needed.

**`if: always()` for cleanup.** The E2E job's `docker compose down` step uses `if: always()` to ensure teardown happens even if Playwright tests fail. Without this, a test failure would leave Docker containers running, potentially causing port conflicts or resource exhaustion on the runner.

**pnpm cache in GitHub Actions.** `actions/setup-node@v4` with `cache: pnpm` caches the pnpm store between runs. This cuts dependency installation from minutes to seconds on cache hits. The cache key is derived from `pnpm-lock.yaml`, so it invalidates when dependencies change.

## Interview Questions

**Q: Why not use a matrix strategy to run stages in parallel?**
A: Matrix strategies are for running the *same* job with different configurations (multiple Node versions, multiple OS). Our stages are *different* jobs with dependency relationships. Parallelizing them would mean running expensive E2E tests even when lint fails, wasting CI minutes.

**Q: How do you handle flaky tests in CI?**
A: Playwright has built-in retry support — our config uses `retries: 1`. For Vitest, we have one known flaky test (`rateLimiter.test.ts`) that's timing-dependent. If it becomes a CI problem, the fix is increasing the timing tolerance, not adding retries — retries mask real issues.

**Q: What happens when a developer adds a new environment variable?**
A: The API's `config.ts` validates all env vars with Zod at startup. If a new required var is added but not included in `.env.ci`, the API container will crash at boot and the E2E/smoke stages will fail. The fix is adding the new var to `.env.ci` — the CI failure points you to the right file.

**Q: Why Chromium only for E2E?**
A: Speed. Adding Firefox and WebKit triples E2E runtime. For a portfolio project, Chromium coverage is sufficient. Cross-browser testing would be worth the cost in a production app with known browser-specific rendering issues.

## Data Structures

The pipeline's dependency graph:

```
quality (lint + typecheck)
  └── test (vitest)
        └── seed-validation (curation pipeline check)
              └── e2e (playwright + docker compose)
                    └── docker-smoke (docker build check)
```

Each node is a GitHub Actions job. An edge means `needs:`. If any node fails, all downstream nodes are skipped.

## Impress the Interviewer

"The CI pipeline is ordered by feedback speed — a type error gives you a red build in 30 seconds instead of waiting 10 minutes for Docker. The seed validation stage is a pattern I'm proud of: it validates our AI pipeline's deterministic output without calling the LLM, so it's free, fast, and deterministic. The E2E stage uses the same Docker Compose file developers use locally, so CI catches exactly the same issues you'd hit on your machine."

You could also mention: "The pipeline has five stages but the first three complete in under a minute. The Docker-based stages are slower but they're gated behind the fast checks, so most failures surface quickly. In a team setting, I'd add build caching for Docker layers to speed up Stages 4 and 5."
