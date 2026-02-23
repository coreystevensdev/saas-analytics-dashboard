# Deployment Roadmap — Interview-Ready Explanation

## Elevator Pitch

This document maps the gap between "works on my laptop" and "handles paying customers." It catalogs what the app already does well (multi-stage Docker builds, RLS multi-tenancy, cache-first AI, Zod-validated config), what's missing (graceful shutdown, usage quotas, error tracking), and provides a concrete checklist for going live. In an interview, you'd describe this as "I audited my own system for production readiness and documented the honest gaps."

## Why This Approach

Most portfolio projects stop at "it runs." This roadmap demonstrates something hiring managers rarely see from junior or mid-level candidates: the ability to look at working software and identify what would break under real load, real users, and real money.

The document is structured around three audiences:
1. **Future-you deploying the app** — concrete checklist, env var list, provider recommendations
2. **Hiring managers evaluating your judgment** — honest gap analysis shows you understand what production means
3. **Collaborators joining the project** — infrastructure context without digging through code

The provider recommendations (Vercel, Railway, Neon, Upstash) aren't arbitrary — each matches a specific constraint. Vercel for Next.js because standalone builds deploy natively. Railway for the Express API because SSE streaming needs persistent connections (serverless would kill mid-stream). Neon for Postgres because it supports custom roles (needed for the dual-pool RLS setup). Upstash for Redis because rate limiting is the only use case and pay-per-request fits the cost profile.

## Code Walkthrough

This is a prose document, not code — but the technical claims it makes are worth tracing:

**"Cache-first architecture is the biggest cost lever"** — This traces to `apps/api/src/routes/aiSummary.ts` lines 33-46. Every AI request checks `getCachedSummary()` before touching Claude. Cache invalidation happens only on `markStale()`, which fires on dataset upload. So a user viewing the same dashboard 100 times = 1 Claude call + 99 database lookups.

**"Dual-role database setup"** — The `docker/init.sql` creates `app_user` (RLS enforced) and `app_admin` (BYPASSRLS). This maps to `apps/api/src/lib/db.ts` which exports both `db` (app_user pool) and `dbAdmin` (app_admin pool). Route handlers wrap queries in `withRlsContext()` from `apps/api/src/lib/rls.ts`, which calls `SET LOCAL app.current_org_id` inside a transaction.

**"Graceful shutdown is missing"** — Check `apps/api/src/index.ts`. There's an `app.listen()` call but no `process.on('SIGTERM')` or `process.on('SIGINT')`. When a container orchestrator sends SIGTERM, Node kills immediately — in-flight SSE streams drop mid-sentence, database transactions roll back, the client sees a broken connection.

**"5 AI requests/min rate limit"** — `apps/api/src/middleware/rateLimiter.ts` defines `AI_RATE_LIMIT` as 5 points per 60-second window. Redis-backed with in-memory fallback. But 5/min with no monthly cap means a determined user can make 7,200 Claude calls per day.

## Complexity and Trade-offs

**Provider lock-in vs convenience**: Recommending Vercel + Railway + Neon is opinionated. You could deploy everything to a single VPS with Docker Compose and save money. But managed services buy you automated backups, scaling knobs, and zero-downtime deploys that you'd otherwise build yourself. The trade-off is vendor-specific configuration (Vercel rewrites, Neon connection strings) vs portability.

**Cost estimates are optimistic**: The "$10-120/mo" range assumes the cache-first architecture works as designed. If a bug invalidates cache too aggressively, or if users upload new datasets frequently, Claude costs spike. The AI usage quota (Action Item #8) is the guardrail — without it, one viral user could run up a $500 bill.

**Blocking vs high-priority split**: The document marks graceful shutdown as "blocking" but error tracking (Sentry) as "high priority." The reasoning: you can deploy without Sentry and diagnose issues from logs. You can't deploy without graceful shutdown because container orchestrators will corrupt in-flight operations. Both matter, but one prevents deployment and the other degrades the deployment experience.

## Patterns Worth Knowing

**Production readiness audit** — The practice of systematically reviewing your own system for deployment gaps. Interviewers love this because it demonstrates self-awareness. You're not claiming the project is perfect — you're showing you know exactly where it isn't and have a plan.

**Defense-in-depth** — The RLS setup is the clearest example. Application-level `WHERE org_id = ?` filtering could work alone. Database-level RLS policies could work alone. Using both means a bug in either layer doesn't leak data. The deployment roadmap highlights this as the most interview-worthy architecture decision.

**Cost-aware architecture** — Cache-first AI, output token caps, rate limiting, prompt size bounded by `topN=8`. These aren't afterthoughts — they're designed into the curation pipeline from the start. The deployment roadmap shows what's still needed (quotas, metrics) to complete the picture.

## Interview Questions

**Q: You wrote a deployment roadmap for a portfolio project. Isn't that overkill?**
A: It's the opposite. Anyone can make an app work locally. The roadmap proves I can think about what breaks at scale — cost runaway, tenant isolation, connection pool exhaustion, ungraceful shutdowns. Those are the problems that matter in production, and the roadmap shows I've already mapped them.

**Q: Why did you recommend specific providers (Vercel, Railway, Neon)?**
A: Each matches a specific technical constraint. Next.js standalone builds deploy natively to Vercel. The Express API uses SSE streaming, which needs persistent connections — serverless would kill the stream mid-response. Neon supports custom PostgreSQL roles, which we need for the dual-pool RLS setup. These aren't brand preferences — they're architecture-driven choices.

**Q: What's the most dangerous gap you identified?**
A: No per-tier AI usage quota. The rate limiter caps at 5 requests/minute, but a pro user could generate 7,200 Claude calls per day. At ~$0.002 per call, that's $14.40/day per user. Scale to 100 users and you're burning $1,440/day. The cache-first architecture mitigates this (most views are cache hits), but the quota is the hard guardrail.

**Q: How would you prioritize the blocking items?**
A: Graceful shutdown first — it's the smallest change with the broadest impact. Then dataset row limit (prevents the computation pipeline from choking on oversized uploads). Then AI quota (prevents cost runaway). Then Docker security (non-root user, health check). Each builds on the previous — you need the app to shut down cleanly before you can trust it to enforce quotas correctly.

## Data Structures

The deployment roadmap references these key data structures:

- **Zod env schema** (`config.ts`) — 14 validated environment variables. The app exits with a formatted error if any are missing. This is the first line of defense against misconfigured deployments.
- **Docker init.sql** — Creates `app_user` (LOGIN, no superuser) and ensures `app_admin` has BYPASSRLS. This SQL runs once on fresh PostgreSQL init. Managed providers need equivalent role setup.
- **Health response** — `{ status: 'ok' | 'degraded', services: { database: {...}, redis: {...} }, timestamp }`. Returns 200 or 503. Container orchestrators, load balancers, and the admin dashboard all consume this.

## Impress the Interviewer

The deployment roadmap is a meta-artifact — it's documentation about what the project *doesn't* do yet. That takes intellectual honesty. Most candidates either claim their project is production-ready (it isn't) or avoid the question entirely. Writing a gap analysis with severity levels, effort estimates, and a deploy checklist shows you understand the full lifecycle from code to production.

The cost estimates section is particularly strong. Saying "$10-120/mo for < 100 users" with a breakdown by service shows you think about operational costs, not just features. Mention the cache-first architecture as the primary cost lever — "most dashboard views hit the cache, so actual Claude calls per user are much lower than the theoretical maximum."

If pushed on horizontal scaling, acknowledge it's a gap. The app is single-process today. Redis handles distributed rate limiting, but the in-memory fallback doesn't coordinate across instances. You'd need PgBouncer (or Neon's built-in pooler) for database connection management, and you'd remove the in-memory rate limiter fallback to avoid per-process drift. These are known, documented gaps — not surprises.
