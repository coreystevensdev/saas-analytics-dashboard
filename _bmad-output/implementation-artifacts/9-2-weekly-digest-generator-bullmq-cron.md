# Story 9.2: Weekly Digest Generator & BullMQ Cron

Status: ready-for-dev

<!-- Epic 9: Weekly Email Digest & Retention Loop. Second story. Depends on 9.1 (email service + provider abstraction). Unblocks 9.3 (template), 9.4 (preferences UI), 9.5 (observability). -->
<!-- Every story must complete all 4 steps: Create → Validate → Dev → Code Review. Don't skip. -->

## Story

As a **small business owner on Pro**,
I want a weekly summary of what changed in my business delivered to my inbox,
so that I stay on top of my numbers without opening the dashboard every week.

## Business Context

Epic 9's retention thesis: the dashboard is great if you open it. A weekly push turns the product into a habit. Story 9.2 is the engine — the scheduled job that decides who gets a digest, runs the curation pipeline server-side, writes the cached summary, and hands it to the email service (9.1) for delivery. Story 9.3 supplies the pretty React Email template; 9.2 must work with a minimal inline template in the meantime so the end-to-end path is testable before 9.3 lands.

Done right: Sunday 18:00 UTC every week, every eligible Pro org gets a digest email that drives re-engagement with the dashboard. Done wrong: duplicate sends on retry, orgs blocked on each other's failures, LLM costs on `off`-cadence users, the curation pipeline leaks raw rows into logs. All four failure modes are explicit ACs below.

## Scope Reconciliation — READ FIRST

**Two pre-existing artifacts this story consumes:**

| Artifact | Today | Story 9.2 posture |
|----------|-------|-------------------|
| `apps/api/src/services/emailDigest/` (worker, scheduler, digestService, resendClient, templates.ts, unsubscribeToken.ts) | Fully operational at `0 19 * * 0`. Uses direct Resend SDK call. README.md added in 9.1 flags retirement in 9.2. | **Delete wholesale** at end of 9.2. The new pipeline at `apps/api/src/jobs/digest/` is a clean rewrite on top of 9.1's `sendEmail`. |
| `apps/api/src/services/curation/config/prompt-templates/v1-digest.md` | Pre-existing 3–5 bullet prompt with legal posture. | **Reuse as-is** as the `digest-weekly` audience variant — it already matches spec intent. No `v1.5` file creation needed; the spec's "v1.5" reference predates the v1-digest.md landing and was resolved by the prior scaffolding. |

**Scope inversion from the epic sketch:**

Epic 9.4's AC says "migration adds `digest_preferences` table." Epic 9.2's AC says "`lastSentAt` on `digest_preferences` gates delivery" and "`digest_preferences` (cadence='weekly' or NULL)" in the eligibility query. These two are inconsistent — 9.2 needs the table to exist before it can run. **Resolution:** Story 9.2 ships the full `digest_preferences` table per 9.4's schema (user_id PK, cadence enum, timezone, lastSentAt, unsubscribedAt, timestamps + RLS). Story 9.4 then owns the UI page (`/settings/email`), the public unsubscribe handler, the Resend webhook receiver, and the admin compliance panel — all on top of the already-present table. Epic.md sequencing is preserved; only the table-creation responsibility shifts one story earlier.

**Per-org vs per-user idempotency (spec ambiguity resolved here):**

- **Per-org dedupe**: handled by the `ai_summaries` cache. A row with `audience='digest-weekly'`, matching `{orgId, datasetId, weekStart}`, and `createdAt >= weekStart` means "this org already has a digest for this week" — the job reads cache, skips LLM call, proceeds to send.
- **Per-user dedupe**: `digest_preferences.lastSentAt` per user. If a user is in multiple orgs and received a digest within the last 6 days (any org), the per-user send step skips. Prevents multi-org users from getting N digests per week.
- **BullMQ repeatable-job dedupe**: the `key` option on the scheduled job handles cron-level duplicate enqueues (cron drift, pod restart mid-tick).

Three layers of idempotency, each owning a specific failure mode. Tests exercise all three.

## Acceptance Criteria

1. **Repeatable cron job registers at boot with idempotency** — Given the API boots, when `initDigestCronJob()` is called from `apps/api/src/index.ts`, then a BullMQ repeatable job named `digest-orchestrator` registers on the `digest-weekly` queue with `{ pattern: '0 18 * * 0', key: 'digest-orchestrator' }` (Sunday 18:00 UTC) and `attempts: 3, backoff: { type: 'exponential', delay: 60_000 }`. A second call to `initDigestCronJob()` within the same process (or a pod restart mid-cron-cycle) does not enqueue a duplicate — BullMQ's repeat-key dedupes. Test: call `initDigestCronJob()` twice, assert `queue.getRepeatableJobs()` returns exactly one entry.

2. **Orchestrator job enumerates eligible orgs in a single SQL query** — Given the cron fires, when the orchestrator job runs, then a single SQL query (via `dbAdmin`, RLS bypassed — this is a platform operation) returns the list of eligible orgs by joining `orgs`, `subscriptions` (status='active', tier='pro'), `datasets` (uploadedAt >= now() - interval '30 days'), and excluding orgs whose sole member has `digest_preferences.cadence='off'`. No per-org follow-up queries for eligibility; the N+1 pattern is a code-review fail. The query lives in a new `apps/api/src/db/queries/digestEligibility.ts` barrel export. **Do not reuse the existing `getAllOrgsWithActiveDataset()`** — it only filters on `activeDatasetId IS NOT NULL` and lacks the subscription + recency + cadence joins. The new `findEligibleOrgs` is a net-new query.

3. **Per-org jobs enqueue with pagination-safe cursor** — Given the eligibility query returns N orgs, when the orchestrator enqueues per-org jobs, then each eligible org becomes one `digest-org` BullMQ job on the `digest-weekly` queue with payload `{ orgId, weekStart, weekEnd }` where `weekStart = Sunday 00:00 UTC of the current week` and `weekEnd = weekStart + 7 days - 1ms`. For N > 500 orgs (far-future concern), pagination uses a keyset cursor on `orgs.id DESC` — LIMIT/OFFSET is acceptable at MVP scale but the cursor helper is structured so a future migration is a one-line swap. Each per-org job has `attempts: 3`, `backoff: { type: 'exponential', delay: 30_000 }`, `removeOnComplete: { count: 50 }`, `removeOnFail: { age: 30 * 86400 }`.

4. **Per-org failures isolate — one org's crash never blocks another** — Given ten per-org jobs run concurrently, when one throws a `DatabaseError` or `LlmError`, then only that job's BullMQ entry retries (and eventually fails after 3 attempts); the other nine complete independently. Assert via integration test: mock one org's pipeline to throw, assert nine others still write `ai_summaries` rows and emit `digest_sent` analytics events.

5. **Curation pipeline reuse with digest-audience prompt variant** — Given a per-org job runs, when the curation pipeline executes for that org, then (a) `runCurationPipeline(orgId, datasetId)` is called with the 30-day window defined by `weekStart..weekEnd` — the existing pipeline already computes against the dataset's own rows, so window scoping is applied at the dataset-selection step (use org's `activeDatasetId`), not inside the pipeline. (b) the top-N scored insights pass through `assemblePrompt(insights, 'v1-digest', businessProfile)` — the existing `v1-digest.md` prompt template is the `digest-weekly` audience variant, already producing 3–5 bullets with legal-posture boundaries. (c) `generateInterpretation(prompt)` calls Claude via the existing LLM provider abstraction (`services/aiInterpretation/`). (d) The result writes to `ai_summaries` with new columns `audience='digest-weekly'` and a composite cache key enforced by a new partial unique index `(org_id, dataset_id, audience, week_start)`.

6. **`ai_summaries` schema extension — additive migration** — Given the schema, when migration `0020_add-ai-summaries-digest-fields.sql` runs, then `ai_summaries` gains: `audience text NOT NULL DEFAULT 'dashboard'` with a CHECK constraint `audience IN ('dashboard', 'digest-weekly', 'share')`, `week_start timestamptz NULL` (NULL for dashboard/share audience, set for digest). Existing rows backfill to `audience='dashboard'` via the DEFAULT. A new partial unique index `idx_ai_summaries_digest_unique ON ai_summaries (org_id, dataset_id, audience, week_start) WHERE audience = 'digest-weekly'` enforces the cache key. Existing `idx_ai_summaries_org_dataset` stays; it still serves the dashboard cache lookup. The dashboard query in `getCachedSummary` adds `and(eq(audience, 'dashboard'))` to scope correctly — without this filter, a digest-weekly row would falsely satisfy a dashboard cache read.

7. **`digest_preferences` table created per 9.4's spec** — Given migration `0021_create-digest-preferences.sql` runs, then table exists with columns: `user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE`, `cadence text NOT NULL DEFAULT 'weekly' CHECK (cadence IN ('weekly', 'monthly', 'off'))`, `timezone text NOT NULL DEFAULT 'UTC'`, `last_sent_at timestamptz NULL`, `unsubscribed_at timestamptz NULL`, `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`. RLS enabled with policy `user_id = current_user_id()` for SELECT/UPDATE/DELETE; INSERT allowed from the row's owner only. Drizzle schema at `apps/api/src/db/schema.ts` adds `digestPreferences` + relation on users. Seed: no backfill needed — users default to cadence='weekly' via the DEFAULT when a row is upserted on first digest attempt.

8. **Per-org job writes to cache then enqueues per-user send jobs** — Given the per-org job completes the pipeline, when the summary is cached, then the job enqueues one `digest-send` BullMQ job per eligible user in the org (users where `digest_preferences.cadence != 'off'` AND `digest_preferences.last_sent_at IS NULL OR last_sent_at < now() - interval '6 days'`). Payload: `{ userId, orgId, summaryId, weekStart, userEmail, orgName }`. Each send job calls `sendEmail({ to, subject, react, tags, correlationId })` via the 9.1 barrel. On success, `UPDATE digest_preferences SET last_sent_at = now() WHERE user_id = $1` plus a `digest_sent` analytics event. On failure, BullMQ retries per the job's backoff; after 3 attempts `last_sent_at` is left untouched (retry next week) and a `digest_failed` analytics event fires.

9. **Minimal inline template — 9.3 replaces** — Given Story 9.3 is not yet merged, when 9.2 ships, then a minimal React Email template at `apps/api/src/jobs/digest/templates/digest-weekly-minimal.tsx` renders: org name + 3–5 bullets from the summary + dashboard deep link with UTM params + CAN-SPAM footer (physical address + unsubscribe link stub pointing to `/unsubscribe?token=...`, HMAC-signed). Template is intentionally ugly — inline styles only, no brand polish. A `TODO` comment at the file top reads: `// Replaced by Story 9.3's proper React Email template. Do not iterate visual design here.` Unsubscribe token uses the existing `signUnsubscribeToken` HMAC helper (from retired `emailDigest/`) copied into `apps/api/src/jobs/digest/unsubscribeToken.ts` — Story 9.4 hardens the unsubscribe flow; 9.2 ships the token only.

10. **Cadence='off' skip at SQL level — no enqueue, no LLM cost** — Given a user has `digest_preferences.cadence='off'`, when the orchestrator runs, then their org does not contribute a per-org job unless the org has other opted-in members. At the per-org level, the send-fan-out step filters users with `cadence='off'` BEFORE enqueueing `digest-send` jobs — the SQL join in the fan-out query uses `WHERE digest_preferences.cadence != 'off' OR digest_preferences.user_id IS NULL` (NULL means "never set preferences, defaults to weekly"). Assert: integration test seeds three users in one org (weekly, monthly, off), asserts two `digest-send` jobs enqueue.

11. **Privacy boundary preserved — assembly receives `ComputedStat[]` only** — Given the digest generator runs, when the curation pipeline executes, then `assemblePrompt` receives the existing `ScoredInsight[]` shape (which contains `ComputedStat` but no `DataRow`) — no raw rows cross the boundary into the prompt assembly layer or into the BullMQ job payload. The job payload for `digest-send` intentionally omits the summary content; it references `summaryId` (ai_summaries FK) and the send worker re-reads the cached content by ID. Rationale: BullMQ job payloads are serialized to Redis; keeping PII and business data out of Redis matches NFR12.

12. **Observability: one Pino log per orchestrator tick, per-org, and per-send** — Given any orchestrator run, when the pipeline completes, then Pino emits: (a) one `info` at orchestrator start with `{ correlationId, eligibleOrgCount, weekStart, weekEnd }`, (b) one `info` per per-org job start and one `info` per per-org job end with `{ correlationId, orgId, durationMs, insightCount, sendJobsEnqueued }`, (c) one `info` per per-send job with `{ correlationId, userId, orgId, templateVersion, outcome, providerMessageId, durationMs }` — the `outcome` field bridges to Story 9.5's analytics events. All logs use object-first structured pattern. An operator grepping `"orgId":42 "outcome":"failed"` must find every failure path in one grep across the three log lines.

13. **Retire old `apps/api/src/services/emailDigest/` — delete all files** — Given the new pipeline at `apps/api/src/jobs/digest/` is wired into boot, when Story 9.2 ships, then `apps/api/src/services/emailDigest/` is deleted entirely (worker.ts, scheduler.ts, digestService.ts, resendClient.ts, templates.ts, unsubscribeToken.ts, README.md, colocated tests and `_explained.md` files). Boot sequence in `apps/api/src/index.ts` drops the three old calls (`initDigestWorker`, `initDigestScheduler`, `shutdownDigestWorker`) and gains four new ones (`initDigestCronJob`, `initDigestOrchestratorWorker`, `initDigestOrgWorker`, `initDigestSendWorker`, `shutdownDigestWorkers`). The `DIGEST_FROM_EMAIL`, `isDigestConfigured` helpers in `config.ts` delete with the folder — `EMAIL_FROM_ADDRESS` replaces them (Story 9.1 added the deprecation comment pointing here). `userOrgs.digestOptIn` column is left in place for one cycle — Story 9.4's retro will decide whether to drop it once `digest_preferences` has real data. Document as tech-debt in `epic-9-retro-pending.md`.

14. **Test coverage — every path, every failure mode** — Given `apps/api/vitest.config.ts`, when tests run, then (a) `initDigestCronJob` idempotency test (two calls → one repeatable job); (b) orchestrator SQL eligibility unit test with a fixture db (Pro + recent dataset = included; Free tier = excluded; Pro + stale dataset = excluded; Pro + `cadence='off'` sole member = excluded); (c) orchestrator integration test enqueuing N per-org jobs and asserting each lands; (d) per-org job integration test with mocked LLM response, asserts `ai_summaries` write with correct audience + week_start, correct `digest-send` fan-out; (e) per-org failure isolation test (one org's mock throws, other orgs succeed); (f) per-user dedupe test (`last_sent_at` within 6 days → send skipped, `last_sent_at = null` → send proceeds); (g) privacy boundary test — assert job payload size stays small and does not contain raw row data; (h) minimal template render test — assert structure + CAN-SPAM footer present; (i) retirement test — snapshot boot sequence, assert no imports from `services/emailDigest/`. No `.skip`, no `.todo`. Every error branch has a named test.

## Tasks / Subtasks

- [ ] **Task 1**: Schema + migrations (AC: #6, #7)
  - [ ] 1.1 Create `apps/api/drizzle/migrations/0020_add-ai-summaries-digest-fields.sql`. Add `audience text NOT NULL DEFAULT 'dashboard'` with CHECK constraint, `week_start timestamptz NULL`. Add partial unique index `idx_ai_summaries_digest_unique` on `(org_id, dataset_id, audience, week_start)` WHERE `audience = 'digest-weekly'`. Existing dashboard rows keep the default value via ALTER COLUMN DEFAULT.
  - [ ] 1.2 Create `apps/api/drizzle/migrations/0021_create-digest-preferences.sql`. Table per AC #7. RLS enable + policy `digest_preferences_owner` on user_id = current_user_id(). Include INSERT/SELECT/UPDATE/DELETE policies. Auto-update `updated_at` trigger (pattern from `0018_add-audit-logs.sql`).
  - [ ] 1.3 Update `apps/api/src/db/schema.ts` — add `audience` + `weekStart` to `aiSummaries` pgTable def; add `digestPreferences` pgTable + `usersRelations` entry pointing to it.
  - [ ] 1.4 Run `pnpm --filter api drizzle:generate` and reconcile any drift in the generated migration files. Manually edit the generated SQL if the drizzle generator picks a different name or misses the partial index — drizzle-kit's partial-index support is fragile.
  - [ ] 1.5 Update `apps/api/src/db/queries/aiSummaries.ts` — `getCachedSummary` adds `eq(aiSummaries.audience, 'dashboard')`; new `getCachedDigest(orgId, datasetId, weekStart)` query for digest reads; `storeSummary` gains optional `audience` + `weekStart` params (default `audience='dashboard'`, `weekStart=null`).
  - [ ] 1.6 Create `apps/api/src/db/queries/digestPreferences.ts` — CRUD barrel: `getByUserId`, `upsertDefaults(userId)` (for first-send), `markSent(userId, sentAt)`, `setCadence(userId, cadence)`, `markUnsubscribed(userId)`. All use the user-scoped `db` client (RLS enforced). `markSent` from the worker context uses `dbAdmin` since workers run outside any user session.
  - [ ] 1.7 Create `apps/api/src/db/queries/digestEligibility.ts` — one query `findEligibleOrgs(cursor?: number, pageSize = 500): Promise<EligibleOrg[]>`. JOIN orgs + subscriptions + datasets + LEFT JOIN digest_preferences on user_orgs owner. Filter clauses match AC #2.
  - [ ] 1.8 Unit tests: `aiSummaries.test.ts` adds cases for audience-scoped reads + digest unique constraint; new `digestPreferences.test.ts`; new `digestEligibility.test.ts` with a fixture database covering all four eligibility cases from AC #14b.

- [ ] **Task 2**: Jobs directory scaffolding (AC: #1, #3, #13)
  - [ ] 2.1 Create directory `apps/api/src/jobs/digest/`. This is the first `jobs/` directory in the codebase — mirror `services/integrations/worker.ts` shape (the most mature BullMQ pattern in the repo).
  - [ ] 2.2 Create `apps/api/src/jobs/digest/queue.ts` — single shared `digest-weekly` BullMQ queue + `connectionOptions()` helper mirroring the integrations worker. Export `getDigestQueue()`, `QUEUE_NAME = 'digest-weekly'`. Job-name constants: `JOB_ORCHESTRATOR = 'digest-orchestrator'`, `JOB_PREFIX_ORG = 'digest-org'`, `JOB_PREFIX_SEND = 'digest-send'`.
  - [ ] 2.3 Create `apps/api/src/jobs/digest/cron.ts` — `initDigestCronJob()` registers the repeatable `digest-orchestrator` job per AC #1. Use BullMQ's `repeat.pattern` + `repeat.key` options. Export `shutdownDigestCron()` for graceful shutdown.
  - [ ] 2.4 Create `apps/api/src/jobs/digest/workers.ts` — three workers: `initOrchestratorWorker`, `initOrgWorker`, `initSendWorker`. Each is a BullMQ `Worker` bound to the shared queue, filtering by job name. Concurrency: orchestrator=1, org=3, send=10 (sane defaults for Resend's 2 emails/sec ceiling). Export `shutdownDigestWorkers()` closing all three.
  - [ ] 2.5 Create `apps/api/src/jobs/digest/index.ts` — barrel re-exporting `initDigestCronJob`, `initDigestOrchestratorWorker`, `initDigestOrgWorker`, `initDigestSendWorker`, `shutdownDigestWorkers`, `shutdownDigestCron`.
  - [ ] 2.6 `apps/api/src/jobs/digest/queue.test.ts` — assert queue name + connection options. `cron.test.ts` — idempotent registration (AC #1). `workers.test.ts` — worker starts + shuts down cleanly. **Mocking pattern**: `vi.mock('bullmq', () => ({ Queue: vi.fn(...), Worker: vi.fn(...) }))` at the top of each test file. This is the established repo pattern — see `apps/api/src/services/integrations/worker.test.ts` line 31. Do NOT install `ioredis-mock` (not in devDeps, not needed — the bullmq mock already covers queue/worker behavior and Redis never gets touched).

- [ ] **Task 3**: Orchestrator job handler (AC: #2, #3, #4, #12)
  - [ ] 3.1 Create `apps/api/src/jobs/digest/handlers/orchestrator.ts` — `handleOrchestratorJob(job: Job)`. Reads `weekStart`/`weekEnd` from current UTC week (Sunday-Sunday). Calls `findEligibleOrgs()` via cursor pagination. For each org, enqueues `digest-org` job with `{ orgId, weekStart, weekEnd }` via `getDigestQueue().add(...)`.
  - [ ] 3.2 Correlation ID: orchestrator generates one `crypto.randomUUID()` + propagates through the org job payload. Each org job propagates to send jobs. One correlation per cron tick — follows an entire user's digest journey across three log lines.
  - [ ] 3.3 Failure semantics: if `findEligibleOrgs` throws (DB outage), the orchestrator job throws → BullMQ retries per attempt policy. If an individual `queue.add` fails (Redis outage mid-enqueue), log the error with orgId + continue (AC #4) — partial batch is better than zero batch.
  - [ ] 3.4 Pino logs per AC #12a: one `info` with `{ correlationId, eligibleOrgCount, weekStart, weekEnd, durationMs }` at completion.
  - [ ] 3.5 `orchestrator.test.ts`: fixture with 10 eligible orgs → 10 per-org jobs enqueued. One mocked `queue.add` throws → remaining 9 still enqueue. Timezone boundary test: assert `weekStart` is always Sunday 00:00 UTC regardless of server local time.

- [ ] **Task 4**: Per-org job handler (AC: #5, #8, #11, #12)
  - [ ] 4.1 Create `apps/api/src/jobs/digest/handlers/perOrg.ts` — `handlePerOrgJob(job: Job)`. Pipeline: load org's businessProfile + activeDatasetId (via `orgsQueries.getActiveDatasetId` already exists), compute cache key `{orgId, datasetId, audience: 'digest-weekly', weekStart}`, check `getCachedDigest(...)` — if hit, skip pipeline, use cached summary; if miss, run full pipeline.
  - [ ] 4.2 Full pipeline: `runCurationPipeline(orgId, datasetId, undefined, financials)` → `assemblePrompt(insights, 'v1-digest', businessProfile)` → `generateInterpretation(prompt)` → validate via `validateStatRefs` (reuse from existing pipeline) → `storeSummary(orgId, datasetId, content, metadata, 'v1-digest', false, undefined, { audience: 'digest-weekly', weekStart })`. The `storeSummary` signature grows to accept audience + weekStart; keep backward compat with default args.
  - [ ] 4.3 Fan-out to send jobs: query `user_orgs` for the org members with a LEFT JOIN on `digest_preferences` — filter `cadence IN ('weekly') OR cadence IS NULL` (monthly-cadence users get skipped at launch per spec — "weekly at launch" is decision A's corollary). Filter `last_sent_at IS NULL OR last_sent_at < now() - interval '6 days'`. For each user passing filters, enqueue `digest-send` job `{ userId, orgId, summaryId, weekStart, userEmail, orgName, correlationId }`.
  - [ ] 4.4 Privacy boundary assert (AC #11): the send-job payload must NOT contain the summary text — only `summaryId`. Write a test that serializes the payload and asserts it's < 1 KB + does not contain any characters from a known-safe summary sample.
  - [ ] 4.5 Pino logs per AC #12b: `info` at start `{ correlationId, orgId, datasetId }`, `info` at end `{ correlationId, orgId, durationMs, insightCount, sendJobsEnqueued, cacheHit: boolean }`.
  - [ ] 4.6 Error handling: DB errors let-propagate (BullMQ retries). LLM timeout → wrap in `DigestJobError({ retryable: true })`, let BullMQ retry up to 3 times. Final failure logs with full error context (stack + orgId). Never partial-state: if pipeline succeeds but send-fan-out fails, the `ai_summaries` row is already cached — next cron tick picks up the cache hit and retries fan-out only.
  - [ ] 4.7 `perOrg.test.ts`: cache hit path (pipeline skipped, fan-out still runs); cache miss path (full pipeline); mocked LLM failure path (retryable error); three-user fan-out test (weekly + monthly + off → one send job, two skipped per AC #10); payload size assertion.

- [ ] **Task 5**: Per-send job handler (AC: #8, #12)
  - [ ] 5.1 Create `apps/api/src/jobs/digest/handlers/perSend.ts` — `handlePerSendJob(job: Job)`. Load summary by `summaryId`, load `digest_preferences` for user (upsert defaults if row missing — first-time recipient). Double-check `last_sent_at` within 6 days → skip with `info` log (defense against race: orchestrator enqueued before a concurrent user action unsubscribed).
  - [ ] 5.2 Render minimal template (Task 6) with `{ orgName, bullets: parseSummaryToBullets(content), dashboardUrl, unsubscribeUrl }`. Call `sendEmail({ to: userEmail, subject: `${orgName} — Weekly insights`, react: <DigestMinimal ... />, tags: { template: 'digest-weekly-minimal', orgId, userId }, correlationId })`.
  - [ ] 5.3 On `sendEmail` success → `digestPreferencesQueries.markSent(userId, now())` + emit analytics event `digest_sent` via `trackEvent(orgId, userId, 'digest_sent', { templateVersion: 'v1-digest', summaryId, weekStart })`. Analytics event constant must land in `packages/shared/constants.ts` — grep `ANALYTICS_EVENTS` to confirm existing shape + add `DIGEST_SENT`, `DIGEST_FAILED`, `DIGEST_SKIPPED` if they aren't already there (the old `emailDigest/digestService.ts` already uses `DIGEST_SENT`/`DIGEST_FAILED`/`DIGEST_TEASER_SENT` — keep the first two, drop the teaser).
  - [ ] 5.4 On `sendEmail` failure with `EmailSendError.retryable=true` → re-throw (BullMQ retries). With `retryable=false` → log + emit `digest_failed` + do NOT retry + do NOT update `last_sent_at` (user retries next week).
  - [ ] 5.5 Rate-limit defense: Resend returns 429 when the plan's send rate is exceeded. Don't hardcode a specific limit in our code — the plan tier changes and Resend publishes the current ceiling in their docs. Strategy: let BullMQ handle it for free. The 9.1 Resend provider already classifies 429 as a retryable `EmailSendError`; BullMQ's exponential backoff on retryable throws means a 429 storm naturally self-throttles without us implementing a token-bucket client-side. Worker concurrency=10 is the starting point; if Sentry shows sustained 429s, drop concurrency in a follow-up PR. Document this trade-off in the handler header comment.
  - [ ] 5.6 Pino log per AC #12c at completion.
  - [ ] 5.7 `perSend.test.ts`: success path (email sent + markSent + digest_sent event); retryable failure (re-throws, no markSent); non-retryable failure (no markSent, digest_failed event, no retry); race-condition last_sent_at check; analytics event shape.

- [ ] **Task 6**: Minimal React Email template (AC: #9)
  - [ ] 6.1 Create `apps/api/src/jobs/digest/templates/digestMinimal.tsx`. Plain React Email components: `<Html><Head/><Body><Container><Heading>{orgName} — Weekly insights</Heading>{bullets.map(b => <Text>{b}</Text>)}<Link href={dashboardUrl}>See full dashboard →</Link><Footer><Text>{mailingAddress}</Text><Link href={unsubscribeUrl}>Unsubscribe</Link></Footer></Container></Body></Html>`. Inline styles only (no external CSS, no media queries). Disclaimer text ("Information only. Not financial advice.") + mailing address from `env.EMAIL_MAILING_ADDRESS`.
  - [ ] 6.2 TODO comment at file top: `// Replaced by Story 9.3's React Email template. Do not iterate visual design here — this is a pass-through to unblock 9.2's end-to-end test.`
  - [ ] 6.3 Helper `parseSummaryToBullets(content: string): string[]` — split the v1-digest output by leading `-` or newline into an array. Defensive: max 5 bullets, each trimmed, skip empty.
  - [ ] 6.4 Dashboard URL builder: `buildDashboardUrl(orgId, datasetId)` → `${env.APP_URL}/dashboard?datasetId=${datasetId}&utm_source=digest&utm_medium=email&utm_campaign=weekly-digest`. Add `packages/shared/constants/utm.ts` with `DIGEST_UTM_PARAMS` constant — AC #6 in Story 9.3 also reads this; centralize now.
  - [ ] 6.5 Unsubscribe URL: `${env.APP_URL}/unsubscribe?token=${signUnsubscribeToken(userId)}`. Create `apps/api/src/jobs/digest/unsubscribeToken.ts` modeled on the retiring `services/emailDigest/unsubscribeToken.ts`, but with **one-arg user-scoped signature** `signUnsubscribeToken(userId: number): string` (and matching `verifyUnsubscribeToken(token): { userId } | null`). The old helper took `(userId, orgId)` because the old pref model was per-org; per Epic 9 decision C, `digest_preferences` is user-scoped and one click stops all digests. HMAC stays identical to the old helper: `createHmac('sha256', env.JWT_SECRET).update(\`unsubscribe:${userId}\`).digest('base64url')`. The `unsubscribe:` purpose prefix is defense-in-depth against JWT-secret cross-context reuse — keep it. Do NOT introduce a new `UNSUBSCRIBE_HMAC_SECRET` env var; the purpose prefix on `JWT_SECRET` is the established pattern.
  - [ ] 6.6 `digestMinimal.test.tsx`: render to HTML via `render()` from `@react-email/components`, assert structure: heading present, bullets present, dashboard URL present with UTMs, unsubscribe URL present, mailing address present, disclaimer text present. One snapshot test on the rendered HTML to catch unintended markup drift.

- [ ] **Task 7**: Boot sequence wiring — delete old, add new (AC: #13)
  - [ ] 7.1 In `apps/api/src/index.ts`: remove the three old imports (`initDigestWorker`, `initDigestScheduler`, `shutdownDigestWorker`) and the four old call sites. Remove the `isDigestConfigured(env)` check — the new cron wiring is unconditional once `EMAIL_PROVIDER` is set (which is validated at boot by Story 9.1's refines). Add new imports from `./jobs/digest/index.js`: `initDigestCronJob`, `initDigestOrchestratorWorker`, `initDigestOrgWorker`, `initDigestSendWorker`, `shutdownDigestWorkers`, `shutdownDigestCron`. Call order: after `initEmailProvider(env)`, before the HTTP listener starts. Shutdown: in the graceful shutdown handler, before `redis.quit()` — same ordering as the old wiring.
  - [ ] 7.2 Delete `apps/api/src/services/emailDigest/` entirely. Verify no other file imports from it via `grep -r "services/emailDigest" apps/api/src/`. If any import survives (shouldn't after Story 9.1's posture), chase it down and re-point to the new location.
  - [ ] 7.3 Delete `DIGEST_FROM_EMAIL` env var + `isDigestConfigured` helper from `config.ts`. Story 9.1 added a deprecation comment on these; honor it now. Verify no test file references them.
  - [ ] 7.4 Update `.env.example` — remove `DIGEST_FROM_EMAIL` entry (comment moved to `EMAIL_FROM_ADDRESS` in 9.1).
  - [ ] 7.5 Retirement test: create `apps/api/src/jobs/digest/retirement.test.ts` that uses `fs.existsSync` or `import.meta.glob` to assert `apps/api/src/services/emailDigest` no longer exists. Prevents regression if a future agent copy-pastes the old pattern back in.

- [ ] **Task 8**: Shared analytics + constants (AC: #8, #12c)
  - [ ] 8.1 Edit `packages/shared/src/constants/index.ts` (confirmed path via grep) — `ANALYTICS_EVENTS` currently has `DIGEST_SENT`, `DIGEST_FAILED`, `DIGEST_TEASER_SENT`, `DIGEST_PREFERENCE_CHANGED` + `SETTINGS_DIGEST_CHANGED` under AUDIT_ACTIONS. Keep `DIGEST_SENT` + `DIGEST_FAILED` + `DIGEST_PREFERENCE_CHANGED` (9.4 uses the preference-change event). Drop `DIGEST_TEASER_SENT` (teaser is deferred per decision A; after the scaffolding retires nothing sends it). Add `DIGEST_SKIPPED: 'digest.skipped'` (used when last_sent_at < 6 days guard fires — AC #12).
  - [ ] 8.2 Create `packages/shared/constants/utm.ts` — export `DIGEST_UTM_PARAMS = { utm_source: 'digest', utm_medium: 'email', utm_campaign: 'weekly-digest' } as const`. Barrel export from `packages/shared/constants/index.ts` (if barrel exists — grep first).
  - [ ] 8.3 Rebuild shared package: `pnpm --filter shared build`.

- [ ] **Task 9**: Config + env updates (AC: none directly — infra carry)
  - [ ] 9.1 Verify `config.ts` has no gaps: `REDIS_URL`, `EMAIL_PROVIDER`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`, `EMAIL_REPLY_TO`, `EMAIL_MAILING_ADDRESS`, `APP_URL`, `JWT_SECRET` all already there from 9.1 + prior work. No new env vars in 9.2.
  - [ ] 9.2 The new `jobs/digest/unsubscribeToken.ts` signs against `env.JWT_SECRET` with a hardcoded `'unsubscribe:'` purpose prefix — same pattern as the retiring helper (verify by reading `services/emailDigest/unsubscribeToken.ts` lines 1–18 before copying). This is defense-in-depth via purpose-prefix, not secret separation. Any future reviewer suggesting a dedicated `UNSUBSCRIBE_HMAC_SECRET` env var should be pointed at this note — the pattern is deliberate, not lazy.

- [ ] **Task 10**: Integration test — end-to-end cron → send (AC: #4, #5, #8, #10, #11)
  - [ ] 10.1 Create `apps/api/src/jobs/digest/integration.test.ts`. Fixture: seed 3 orgs — Org A (Pro, recent dataset, one user with weekly cadence), Org B (Pro, stale dataset → excluded), Org C (Pro, recent dataset, three users: weekly + monthly + off). Mock Claude to return a known 3-bullet response. Mock `sendEmail` (inject test provider via `registerEmailProvider(testProvider)` at suite setup) to capture calls.
  - [ ] 10.2 Run the orchestrator job handler directly (not via BullMQ — call the handler fn with a mock Job). Assert: 2 per-org jobs enqueued (Org A, Org C). Run per-org handlers directly. Assert: 2 `ai_summaries` rows written with `audience='digest-weekly'` + correct weekStart. Assert: 2 `digest-send` jobs enqueued from Org A (1 user) + Org C (1 user passing cadence filter). Run per-send handlers. Assert: 2 `sendEmail` captures with correct to/subject, 2 `digest_sent` analytics events, 2 `digest_preferences.last_sent_at` updates.
  - [ ] 10.3 Force one per-org handler to throw. Assert: the other completes successfully + writes its row. Asymmetric path — AC #4 validation.
  - [ ] 10.4 Re-run the full cycle immediately (simulate cron retrigger). Assert: cache hits for both Org A + Org C (no LLM calls). Assert: per-user dedupe kicks in (last_sent_at within 6 days) — zero `digest-send` jobs enqueued, zero analytics events.

- [ ] **Task 11**: Documentation (AC: carry-over from ALWAYS-ON mandates)
  - [ ] 11.1 Each new `.ts`/`.tsx` file in `apps/api/src/jobs/digest/` gets a companion `_explained.md` following the 8-section interview format. Files: `queue.ts`, `cron.ts`, `workers.ts`, `index.ts`, `handlers/orchestrator.ts`, `handlers/perOrg.ts`, `handlers/perSend.ts`, `templates/digestMinimal.tsx`, `unsubscribeToken.ts`.
  - [ ] 11.2 Update `_bmad-output/planning-artifacts/architecture.md` — replace the old `emailDigest/` section with the new `jobs/digest/` structure. Note the three-layer idempotency design (BullMQ repeat-key, ai_summaries composite unique, per-user `last_sent_at`). Add a short diagram: orchestrator → per-org → per-send.
  - [ ] 11.3 Update `_bmad-output/project-context.md` — new rule: "BullMQ repeatable jobs use `{ pattern, key }` for deduplication. Never re-add a repeatable without setting `key`, or cron drift will silently duplicate jobs." Second rule: "Digest pipeline audience='digest-weekly' has a composite unique key `(org_id, dataset_id, audience, week_start)` — any new summary-audience variant must land a new partial unique index."
  - [ ] 11.4 Append to `_bmad-output/implementation-artifacts/epic-9-retro-pending.md`: (a) `userOrgs.digestOptIn` column deprecation — drop in 9.4 retro once `digest_preferences` has production data; (b) `v1-digest` prompt stays at v1 — no variant versioning in 9.2 since it already matches spec intent, revisit if A/B testing arrives; (c) send worker concurrency=10 — revisit if Resend 429 surfaces under load (currently defense is BullMQ retry on retryable `EmailSendError`).

- [ ] **Task 12**: Quality gates
  - [ ] 12.1 `pnpm --filter api type-check` clean.
  - [ ] 12.2 `pnpm --filter api lint` clean.
  - [ ] 12.3 `pnpm --filter api test` — full suite + new tests all green.
  - [ ] 12.4 `pnpm --filter api build` clean.
  - [ ] 12.5 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: `9-2-weekly-digest-generator-bullmq-cron: ready-for-dev` → `in-progress` → `review` → `done` as phases complete.

## Dev Notes

### Architecture Compliance

- **Privacy boundary (NFR12)** — pipeline order is row-fetch (`dataRowsQueries`) → compute (`computeStats` returns `ComputedStat[]`) → score → assemble (receives `ScoredInsight[]` which carries `ComputedStat`, never `DataRow`). The digest job payloads also carry only IDs — never summary content, never rows. Test T#4.4 asserts payload size stays small as a regression guard.
- **Pino structured logging** — object-first. Three log lines per user journey (orchestrator, per-org, per-send) with shared `correlationId`. One grep finds an entire digest trace.
- **Env via config.ts** — no `process.env` in jobs/digest/. All env accesses go through the Zod-validated `env` import.
- **Import boundaries** — `apps/web` does not import `apps/api/src/jobs/`. Digest is server-only.
- **ESM suffixes** — all relative imports use `.js` suffix (`import { x } from './y.js'`). Runtime breaks without it under the `"type": "module"` setting.
- **Drizzle query patterns** — queries live in `db/queries/` barrel; services and jobs import from the barrel, never from `db/schema.ts` or `db/index.ts` directly. The new `digestEligibility.ts` follows this.
- **RLS enforcement** — `digest_preferences` has RLS policies; worker code uses `dbAdmin` (service-role bypass, platform operation). The new queries file's functions pick the right client per caller context — user-facing queries (future 9.4 routes) use `db`, worker queries use `dbAdmin`. Document this in each query's JSDoc.
- **BullMQ connection pattern** — mirror `services/integrations/worker.ts` — separate `connectionOptions()` function, `maxRetriesPerRequest: null` (BullMQ requires this on worker connections).
- **Correlation ID threading** — job payloads carry `correlationId` forward. Orchestrator generates `crypto.randomUUID()`, propagates to per-org jobs, per-org propagates to per-send. Matches the HTTP request path convention (middleware/correlationId.ts sets req.correlationId).

### Library / Framework Requirements

| Library | Version | Reason |
|---------|---------|--------|
| `bullmq` | `^5.74.1` (already present) | Queue + Worker + repeatable jobs. Already battle-tested by `services/integrations/`. |
| `ioredis` | `^5.x` (already present via bullmq peer) | Queue backend. `REDIS_URL` already configured. |
| `@react-email/components` | `^1.x` (added by 9.1) | Minimal template in Task 6. Server-side render via `render()`. |
| `resend` | `^6.12.0` (already present) | Routed through 9.1's `sendEmail` barrel — don't touch the SDK directly. |
| `zod` | `3.23.8` (already pinned) | Query-shape validation if needed. Do NOT import Zod 4. |
| `drizzle-orm` | `0.45.x` (already present) | Schema + queries. Partial unique index needs manual SQL review after `drizzle:generate`. |

### File Structure Requirements

**New files (`apps/api/src/jobs/digest/`):**

```
jobs/
└── digest/
    ├── index.ts                              # barrel — re-exports init*/shutdown* fns
    ├── queue.ts                              # shared Queue singleton + connection helper + constants
    ├── cron.ts                               # initDigestCronJob() — repeatable job registration
    ├── workers.ts                            # initOrchestratorWorker, initOrgWorker, initSendWorker
    ├── unsubscribeToken.ts                   # HMAC signing (copied from retiring emailDigest/)
    ├── handlers/
    │   ├── orchestrator.ts                   # enumerate eligible orgs + fan out
    │   ├── perOrg.ts                         # run curation pipeline + cache + fan-out to sends
    │   └── perSend.ts                        # render template + sendEmail + markSent + analytics
    ├── templates/
    │   └── digestMinimal.tsx                 # placeholder — 9.3 replaces
    ├── *.test.ts                             # unit tests per handler + queue + cron + workers
    ├── integration.test.ts                   # e2e orchestrator → send
    ├── retirement.test.ts                    # assert services/emailDigest/ deletion
    └── *_explained.md                        # companion docs (always-on mandate)
```

**New — migrations + queries:**

- `apps/api/drizzle/migrations/0020_add-ai-summaries-digest-fields.sql`
- `apps/api/drizzle/migrations/0021_create-digest-preferences.sql`
- `apps/api/src/db/queries/digestPreferences.ts` (+ test)
- `apps/api/src/db/queries/digestEligibility.ts` (+ test)

**New — shared package:**

- `packages/shared/constants/utm.ts` — `DIGEST_UTM_PARAMS` constant

**Modified:**

| File | Change |
|------|--------|
| `apps/api/src/db/schema.ts` | `aiSummaries`: add `audience` + `weekStart` columns + partial unique index. Add `digestPreferences` pgTable + relations. |
| `apps/api/src/db/queries/aiSummaries.ts` | `getCachedSummary` scopes to `audience='dashboard'`; new `getCachedDigest`; `storeSummary` accepts optional audience + weekStart. |
| `apps/api/src/db/queries/index.ts` | Barrel adds `digestPreferences`, `digestEligibility`. |
| `apps/api/src/index.ts` | Remove old emailDigest imports + calls. Add new jobs/digest boot + shutdown calls. Drop `isDigestConfigured` branch. |
| `apps/api/src/config.ts` | Delete `DIGEST_FROM_EMAIL` + `isDigestConfigured`. Ensure `UNSUBSCRIBE_HMAC_SECRET` is Zod-validated if it wasn't. |
| `.env.example` | Remove `DIGEST_FROM_EMAIL`. Verify `UNSUBSCRIBE_HMAC_SECRET` row exists + is documented. |
| `packages/shared/constants.ts` (or constants/index.ts) | `ANALYTICS_EVENTS`: drop `DIGEST_TEASER_SENT`, add `DIGEST_SKIPPED` if missing. |
| `_bmad-output/planning-artifacts/architecture.md` | Replace `emailDigest/` section with new `jobs/digest/` structure + three-layer idempotency diagram. |
| `_bmad-output/project-context.md` | Two new rules (BullMQ repeat-key + ai_summaries audience composite unique). |
| `_bmad-output/implementation-artifacts/epic-9-retro-pending.md` | Three new retro items per Task 11.4. |
| `_bmad-output/implementation-artifacts/sprint-status.yaml` | Status transitions for 9-2. |

**Deleted (Task 7.2):**

All of `apps/api/src/services/emailDigest/`:
- `worker.ts`, `scheduler.ts`, `digestService.ts`, `resendClient.ts`
- `templates.ts`, `templates.test.ts`
- `unsubscribeToken.ts`, `unsubscribeToken.test.ts`
- `digestService.test.ts`
- `index.ts`, `README.md`
- all `*_explained.md` companions

### Testing Requirements

- All tests under `apps/api/vitest.config.ts` (Node environment).
- **No flaky timers** — use `vi.useFakeTimers()` for any cron or rate-limit timing assertion. The repo's existing `rateLimiter.test.ts` is flagged as timing-flaky in memory; don't replicate that pattern.
- **Fixture database pattern** — follow `apps/api/src/db/queries/*.test.ts` for setup/teardown. Use `db.transaction(async tx => { ... })` with rollback at the end so tests don't leak state.
- **BullMQ in tests** — use `ioredis-mock` if it's in devDeps; otherwise use a real Redis container (grep existing BullMQ tests to see the established pattern).
- **Integration test** exercises the full cron → orchestrator → per-org → per-send chain without actually touching Redis queue scheduling — call handler functions directly with mock Job objects. Redis roundtrip tested separately in `queue.test.ts` and `cron.test.ts`.
- **Named-path coverage** — every AC has at least one named test. AC #4 (isolation) and AC #10 (cadence=off) and AC #11 (privacy boundary) are the load-bearing correctness tests — these must be unambiguously asserted, not stubbed.

**Test file inventory:**

| File | Covers | Task |
|------|--------|------|
| `apps/api/src/db/queries/digestPreferences.test.ts` (new) | CRUD + RLS policy enforcement | 1.8 |
| `apps/api/src/db/queries/digestEligibility.test.ts` (new) | Eligibility SQL — Pro+recent+not-off | 1.8 |
| `apps/api/src/db/queries/aiSummaries.test.ts` (modified) | Audience-scoped reads + digest composite unique | 1.8 |
| `apps/api/src/jobs/digest/queue.test.ts` (new) | Queue singleton + connection options | 2.6 |
| `apps/api/src/jobs/digest/cron.test.ts` (new) | Idempotent repeatable registration (AC #1) | 2.6 |
| `apps/api/src/jobs/digest/workers.test.ts` (new) | Worker lifecycle + graceful shutdown | 2.6 |
| `apps/api/src/jobs/digest/handlers/orchestrator.test.ts` (new) | Eligibility enumeration + fan-out + UTC week math | 3.5 |
| `apps/api/src/jobs/digest/handlers/perOrg.test.ts` (new) | Cache hit/miss + fan-out + cadence filter + payload privacy | 4.7 |
| `apps/api/src/jobs/digest/handlers/perSend.test.ts` (new) | Send path + markSent + analytics + retryable vs terminal failure | 5.7 |
| `apps/api/src/jobs/digest/templates/digestMinimal.test.tsx` (new) | Render structure + CAN-SPAM footer + UTM params | 6.6 |
| `apps/api/src/jobs/digest/integration.test.ts` (new) | e2e 3-org scenario + retrigger dedupe | 10 |
| `apps/api/src/jobs/digest/retirement.test.ts` (new) | `services/emailDigest/` no longer exists | 7.5 |

### Previous Story Intelligence (Story 9.1)

Patterns that apply directly:

- **Provider abstraction reuse** — `sendEmail(opts)` from `services/email/index.ts` is the only path to wire. The retired `resendClient.ts` tried to call Resend directly; the new send handler never does. If a reviewer sees any import of `resend` or `@react-email/components` inside `jobs/digest/` (except for `render()` in the template render step), that's a correctness bug — provider swap becomes impossible.
- **`EmailSendError.retryable` discriminant** — 9.1 ships this with `retryable: boolean`. The per-send handler branches on it: retryable=true → re-throw (BullMQ retry), retryable=false → log + analytics + do-not-retry.
- **Render path is async** — `await render(reactElement)` returns `Promise<string>`. 9.1's debug log captured this (the initial unit tests missed it). Don't re-introduce the sync-render bug.
- **Resend SDK uses camelCase `replyTo`** — not `reply_to`. 9.1's dev notes flagged this. `sendEmail`'s internal wrapper already normalizes; callers pass `replyTo` on the opts object and never touch the SDK directly.
- **Sentry capture shape** — 9.1 tags failures with `{ provider: 'email', template, retryable }`. The per-send handler inherits this — no extra Sentry calls from the digest layer.

Anti-patterns from Epic 2–8 code reviews that apply here:

- **No `process.env` outside config.ts** (repeated finding).
- **No `console.log`** — Pino only.
- **No `String + variable` in log messages** — object-first.
- **Catch specific errors, let the rest propagate** — don't `catch (err) { log; throw err }` without adding context. BullMQ's error handling is enough for retryable errors.
- **Grep before you scope** (memory feedback from saveCashBalance + audit-sweep) — the `v1-digest.md` prompt already exists, `digestOptIn` boolean already exists on userOrgs, the HMAC signer already exists in the retiring folder. Don't invent new versions of any of these.

### Git Intelligence (last 5 commits)

| Commit | Relevance |
|--------|-----------|
| `5e9de3c` fix(email): story 9.1 code-review pass — can-spam + delivery guards | Direct — 9.1's code-review pass added RFC 2606 reserved-domain guard + CAN-SPAM placeholder-address guard. The digest send path inherits these config validations; no re-work needed in 9.2. |
| `e272b15` feat(email): story 9.1 — provider abstraction + console/resend backends | Direct — this story consumes `sendEmail` from this commit. Review its `EmailSendError.retryable` shape before starting Task 5.4. |
| `580fafd` docs(bmad): story 9.1 ready-for-dev, epic 9 in-progress | Reference — the retirement of `emailDigest/` was structured as 9.1-leaves-alone + 9.2-deletes. 9.2 honors that split. |
| `514bc28` docs(bmad): epic 9 sprint planning + 3 decisions resolved | Reference — Pro-only (A), text-only (B), user_id PK (C). All three shape this story. |
| `afe9314` docs(bmad): draft epic 9 weekly email digest | Reference — original epic draft. Superseded by epics.md sections Epic 9, Story 9.2. |

Commits predating formal Epic 9 that still matter:

- `a8628d1` feat: add weekly email digest and integrations settings page — landed the `emailDigest/` scaffolding this story retires. Read before starting Task 2 to understand the pattern you're replacing.
- `37de6e8` feat: add Sentry user context, audit logging, and digest tests — existing digest tests get deleted with the folder. Check what they asserted before deleting — some assertions (eligibility, per-org isolation) move to the new test files.
- `bdb3a05` — first SQL aggregation for monthly buckets. Pattern reference for the `findEligibleOrgs` single-SQL approach (AC #2).

### Latest Tech Information

- **BullMQ 5.x repeatable job semantics** — `queue.add(name, data, { repeat: { pattern, key } })` creates a repeatable job. Adding again with the same `key` is a no-op (idempotent). `queue.getRepeatableJobs()` returns registered patterns. `queue.removeRepeatableByKey(key)` removes. The `jobId` option at the top level of `add` is different from `repeat.key` — don't confuse the two. Context7 confirms the `repeat.key` semantic (2026-04-23).
- **BullMQ concurrency model** — Worker `concurrency` option limits parallel jobs per worker. Multiple workers on the same queue multiply concurrency. For digest: 3 org workers × 3 concurrency = 9 parallel org jobs; 10 send workers × 10 concurrency = 100 parallel send attempts. Resend's rate limit is the practical ceiling — see Task 5.5.
- **Drizzle partial unique index** — drizzle-kit's 0.45.x generator does not fully support partial indexes in some cases. After `drizzle:generate`, manually inspect the generated migration SQL and add the `WHERE audience = 'digest-weekly'` clause if missing. Pattern established in `0013_fix-ai-summaries-rls-policy.sql` where manual SQL edits were committed.
- **React Email 1.x `render()`** — async, `Promise<string>`. Story 9.1 established the call pattern. Render errors throw; wrap in try/catch if the template has dynamic content that could fail (e.g., malformed bullet data).
- **Pinned Zod 3.x** — carry-over from architecture. Query-shape validation with `.refine()` works, Zod 4 features don't.

### Project Structure Notes

- **New top-level directory `apps/api/src/jobs/`** — first non-service BullMQ code in the repo. Rationale: `services/` is for pure domain logic; `jobs/` is for BullMQ-triggered workflows. The pattern mirrors `services/integrations/worker.ts` but lives in its own tree because the QuickBooks sync is fundamentally a service with a queue backend, whereas the digest is a scheduled workflow that happens to invoke services. Flag to reviewer: acceptable deviation or should `jobs/` live under `services/`?
- **Three workers instead of one** — the existing `emailDigest/worker.ts` had one worker processing everything. The new split (orchestrator, per-org, per-send) gives independent concurrency control, independent retry behavior, and cleaner test seams. Matches the BullMQ docs' "break your work into dedicated queues or at least dedicated job names" recommendation.
- **Handler-per-file pattern** — `handlers/{orchestrator,perOrg,perSend}.ts`. Each file exports one handler function. Keeps files small + test files co-located. Mirrors `services/integrations/quickbooks/sync.ts` which already uses one file per sync phase.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Story 9.2`] — full AC + technical notes
- [Source: `_bmad-output/planning-artifacts/epics.md#Epic 9`] — sprint-planning decisions A/B/C
- [Source: `_bmad-output/implementation-artifacts/9-1-email-infrastructure-provider-integration.md`] — 9.1 complete, provider abstraction ready
- [Source: `apps/api/src/services/email/index.ts`] — `sendEmail` barrel + `EmailSendError` discriminant
- [Source: `apps/api/src/services/emailDigest/`] — retiring scaffolding; read for patterns, delete in Task 7.2
- [Source: `apps/api/src/services/integrations/worker.ts`] — reference BullMQ pattern (connectionOptions, queue singleton, worker init/shutdown)
- [Source: `apps/api/src/services/curation/index.ts`] — `runCurationPipeline`, `runFullPipeline`, validators. Digest handler reuses these + adds audience-scoped storage.
- [Source: `apps/api/src/services/curation/config/prompt-templates/v1-digest.md`] — already the 3–5 bullet digest prompt
- [Source: `apps/api/src/db/queries/aiSummaries.ts`] — cache patterns to extend for audience scoping
- [Source: `apps/api/drizzle/migrations/0013_fix-ai-summaries-rls-policy.sql`] — pattern for manually-edited drizzle migrations
- [Source: `CLAUDE.md#Mandatory Rules`] — Pino, env access, import boundaries, BFF
- [Source: `MEMORY.md#Always-Active Skills`] — `humanize-code`, `interview-docs`, `humanizer` ALWAYS-ON

## Story Validation Record — 2026-04-24

Adversarial review pass complete. Five findings resolved before dev start:

| Finding | Fix applied |
|---------|-------------|
| CRITICAL — `signUnsubscribeToken` one-arg invented; actual helper is two-arg `(userId, orgId)` | Task 6.5 rewritten: new helper is user-scoped one-arg, matches decision C (pref is user-scoped). HMAC uses `JWT_SECRET` + `unsubscribe:` purpose prefix — same pattern as the retiring helper. |
| CRITICAL — `getAllOrgsWithActiveDataset` insufficient for eligibility (no Pro join, no recency, no cadence) | AC #2 now explicitly says "Do not reuse" the existing helper. `findEligibleOrgs` is a net-new query. |
| CRITICAL — `UNSUBSCRIBE_HMAC_SECRET` doesn't exist; retiring helper uses `JWT_SECRET` with purpose prefix | Task 9.2 rewritten — the purpose-prefix pattern is deliberate defense-in-depth, not lazy. No new env var. |
| MEDIUM — "Resend free tier = 2 emails/sec" unsourced and likely wrong | Task 5.5 reframed — don't hardcode a ceiling; BullMQ retry on 429 (retryable `EmailSendError`) self-throttles. Concurrency is observable and tunable post-launch. |
| MEDIUM — `ioredis-mock` not in devDeps; tests would hit install wall | Task 2.6 replaced with explicit `vi.mock('bullmq', ...)` pattern — matches `services/integrations/worker.test.ts:31`. |

Other verified claims (confirmed accurate, no change needed): `assemblePrompt(insights, promptVersion, profile)` 3-arg signature, `runCurationPipeline` returning `ScoredInsight[]` already-scored (no double-scoring in story), `userOrgs.digestOptIn` column exists, Resend SDK uses `replyTo` camelCase, `isDigestConfigured` + `DIGEST_FROM_EMAIL` exist for deletion. `DIGEST_PREFERENCE_CHANGED` analytics event preserved (9.4 uses it).

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
