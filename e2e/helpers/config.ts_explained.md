# config.ts — Interview-Ready Documentation

## Elevator Pitch

A tiny configuration module for E2E test helpers that resolves `JWT_SECRET` and `DATABASE_ADMIN_URL` from environment variables (with safe defaults for CI). The interesting part: it has a hard safety check that refuses to run if the database URL points anywhere other than localhost or Docker Compose — a guardrail against accidentally running destructive test fixtures against a real database.

## Why This Approach

E2E fixtures do things like `INSERT INTO users` and `DELETE FROM analytics_events`. If those queries hit a production or staging database, you've got a serious incident. The safety check on line 8 prevents that by inspecting the URL and throwing a loud, descriptive error if it doesn't match `localhost`, `127.0.0.1`, or `db:` (the Docker Compose service name).

Defaults are provided so CI runs without any environment configuration. Locally, developers can override via `.env` or shell exports.

## Code Walkthrough

- **`JWT_SECRET`** — falls back to a hardcoded 60-character string. The length matters: HS256 requires at least 32 bytes, and the Zod validation in the API's config will reject shorter secrets.
- **`DATABASE_ADMIN_URL`** — defaults to the local Docker Compose PostgreSQL. The `app_admin` role has write access needed for test fixtures.
- **Safety guard** — checks if the resolved URL contains `localhost`, `127.0.0.1`, or `db:`. If none match, it throws immediately on module load. This is a fail-fast pattern — the error happens before any database queries execute.

## Complexity & Trade-offs

Minimal complexity. The trade-off is that the safety check uses string matching, which is imperfect. A URL like `https://evil.com?redirect=localhost` would pass. But the check is a safety net, not a security boundary — the real protection is that CI environments shouldn't have production credentials in the first place.

## Patterns Worth Knowing

**Fail-fast module initialization** — throwing at import time (top-level code) means any test file that imports this module will crash before running a single test. This is better than a runtime check buried in a helper function, because you get the error immediately and obviously.

## Interview Questions

**Q: Why check the database URL instead of relying on environment separation?**
A: Defense in depth. Environment separation (different secrets per env) is the primary protection. This check is a secondary guardrail for the case where someone accidentally sets `DATABASE_ADMIN_URL` to a production value in their local shell. Belt and suspenders.

**Q: Why is the default JWT secret so long?**
A: The API's config validation (Zod schema) requires the secret to be at least 32 characters for HS256 security. The default is 60 characters to pass that validation without any environment setup.

## Data Structures

Two exported string constants: `JWT_SECRET` and `DATABASE_ADMIN_URL`. Both are resolved once at module load time and are immutable thereafter.

## Impress the Interviewer

The safety guard is the kind of thing that separates production-aware engineers from those who've never been paged at 2 AM. It costs three lines of code and prevents a class of incident that's genuinely catastrophic — running test fixtures against a production database. In an interview, say: "Test infrastructure that can write to a database should have a hard check against non-local targets. It's cheap insurance."
