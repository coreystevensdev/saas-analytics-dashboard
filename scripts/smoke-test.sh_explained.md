# smoke-test.sh — Interview Companion

## Elevator Pitch

A 30-line shell script that proves `docker compose up` produces a working app. It starts all services, waits for the API health check, verifies HTTP 200, and tears down. This is the "hiring manager test" — can someone clone the repo and get a running system with one command?

## Why This Approach

The smoke test validates the Docker *build*, not the app's behavior. E2E tests cover user journeys. This covers: do the Dockerfiles compile? Do the containers start? Can they talk to each other? Does the API respond?

**What's happening:** We spin up the full Docker Compose stack and poke the health endpoint.
**How to say it:** "The smoke test validates infrastructure — that the Docker build produces healthy, networked containers. It's separate from E2E because you can pass E2E with dev-mode processes but fail smoke if a Dockerfile is broken."

## Code Walkthrough

Three phases:

1. **Setup**: `set -euo pipefail` for strict error handling. A `trap cleanup EXIT` ensures `docker compose down --volumes` runs no matter how the script exits — success, failure, or signal.

2. **Start and wait**: `docker compose up -d --build` starts all services. A retry loop polls `localhost:3001/health` once per second for up to 90 seconds. If the health check never passes, it dumps the last 50 lines of Docker logs for debugging and exits 1.

3. **Verify**: An explicit `curl` checks for HTTP 200. Belt and suspenders — the loop already proved the endpoint responds, but the explicit status code check makes the assertion visible.

## Patterns Worth Knowing

**Trap-based cleanup** is the shell equivalent of a `finally` block. `trap cleanup EXIT` runs on *any* exit — normal, error, or signal. Without it, a failed health check leaves orphaned containers eating resources on the CI runner.

**`set -euo pipefail`** is defensive shell scripting: `-e` exits on error, `-u` treats unset variables as errors, `-o pipefail` propagates failures through pipes. You'll see this in any production shell script.

## Interview Questions

**Q: Why not just use the E2E stage's Docker Compose setup?**
A: They test different things. E2E validates user-facing behavior against a running stack. Smoke validates the Docker build itself. You could pass E2E by running dev-mode processes locally but fail smoke if `Dockerfile.api` has a broken `COPY` instruction.

**Q: What's the 90-second timeout for?**
A: Docker image builds can take a while, especially on CI runners with cold caches. The API also waits for DB and Redis health checks before starting. 90 seconds gives enough headroom without letting a truly broken build hang CI indefinitely.

## Impress the Interviewer

"The smoke test is our contract with the README. If the README says 'run `docker compose up`', this script proves that contract holds on every push. The trap-based cleanup prevents resource leaks on CI runners, and the explicit HTTP 200 check makes the pass/fail criteria unambiguous."
