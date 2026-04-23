# Story 9.1: Email Infrastructure & Provider Integration

Status: ready-for-dev

<!-- Epic 9: Weekly Email Digest & Retention Loop. First story in the epic; unblocks 9.2 (digest generator), 9.3 (template), 9.4 (preferences), 9.5 (observability). Also foundation for Epic 10 alerts (GTM Week 4). -->
<!-- Every story must complete all 4 steps: Create → Validate → Dev → Code Review. Don't skip. -->

## Story

As a **platform operator**,
I want a single email service with provider abstraction,
so that every new transactional email in the system (digest, alerts, future features) flows through one observable path.

## Business Context

Story 9.1 sends no customer email. It builds the infrastructure that 9.2–9.5 and every future email feature (alerts, re-engagement, system mail) flows through. Done right: every downstream email is a template + a send call. Done wrong: scattered SDK calls, no provider swap, no dev capture — every future email feature pays a tax. Cost ceiling: Resend free tier = 3k/month; GTM budgets $0–20/mo through Week 12 — hence the `console` provider default for non-production.

## Prior Scaffolding (IMPORTANT — READ FIRST)

Commit `a8628d1` (pre-Epic-9-planning) landed working digest scaffolding at `apps/api/src/services/emailDigest/`:

| File | Status |
|------|--------|
| `resendClient.ts` | Direct Resend SDK call — NOT the provider-abstracted pattern this story builds |
| `digestService.ts` | Per-org digest generation + send — out of 9.1 scope |
| `worker.ts` | BullMQ queue `email-digest` — out of 9.1 scope |
| `scheduler.ts` | Cron `0 19 * * 0` (Sunday 19:00 UTC) — Story 9.2 spec says 18:00 UTC (1hr delta to reconcile) |
| `templates.ts` | Raw HTML strings — NOT React Email; 9.3 replaces this |
| `unsubscribeToken.ts` | HMAC signing — 9.4 may reuse or supersede |

**Posture for 9.1**: **Strictly additive**. Build new `apps/api/src/services/email/` with provider abstraction. Do NOT touch `emailDigest/`. Story 9.2 ships the new digest generator at `apps/api/src/jobs/digest/` using this new service, at which point `emailDigest/` can be deleted in 9.2's scope. This story leaves the existing digest pipeline fully operational but decoupled from the new service.

**Spec-to-code gap note (for validation step)**: Story 9.1 acceptance criterion "existing Epic 1 and Epic 5 email paths (invite email, payment-failure email) untouched" — those paths don't exist in code. Invite flow (Story 1.5) uses link-copy only, no email. Payment-failure flow (Story 5.4) has no email send. The AC is vacuously satisfied. No TODO comments needed in non-existent code. Flag for validation.

## Open Questions — Read Before ACs

These questions bias the ACs and tasks below. Resolve before the dev agent commits.

1. **AC #6 in epic spec** ("existing Epic 1 and Epic 5 email paths untouched") references code that doesn't exist. Invite flow is link-only; payment-failure flow has no email send. **Recommend**: strike the AC or rephrase as "no existing email code paths in the repo need preserving — confirmed by grep."
2. **Prior scaffolding conflict**: `emailDigest/` directly calls Resend. Strictly additive posture says leave it alone and supersede in 9.2. **Confirm**: dev agent does NOT refactor existing `emailDigest/` in 9.1 scope.
3. **Postmark stub or omit entirely?** Task 2.8 ships a thrown-error stub to prove the factory pattern. **Recommend**: keep the stub — 3 lines, proves the factory compiles. Affects AC #7.
4. **`EMAIL_CAPTURE_DIR` (AC #12)**: dev-ergonomics feature or scope creep? **Recommend**: ship it — previewing 9.3 templates in a browser rather than stitching Pino logs saves real iteration time.
5. ⚠️ **Health-check probe to Resend (affects AC #10)**: `resend.domains.list()` incurs a real API call every 30s (cached). **Recommend**: static-`ok` on the email provider. Health endpoint's purpose is "is the process alive and DB/Redis reachable," not "do all upstream vendors respond." Downgrade AC #10 to static health for both providers; actual Resend health surfaces via send-failure metrics.
6. **Naming**: `services/email/` vs existing `services/emailDigest/` — close enough to cause IDE autocomplete confusion. **Recommend**: stick with `email/` — clearer on intent; the conflict is temporary (emailDigest retires in 9.2).
7. **`isDigestConfigured(cfg)` helper** — used only by `emailDigest/`. **Recommend**: leave untouched. Retires with the scaffolding in 9.2.

## Acceptance Criteria

1. **Provider interface defined and registered at boot** — Given the API boots in any environment, when `apps/api/src/services/email/provider.ts` exports an `EmailProvider` interface (`name`, `send(opts): Promise<SendResult>`, `checkHealth(): Promise<ProviderHealth>`) that mirrors the `LlmProvider` pattern at `apps/api/src/services/aiInterpretation/provider.ts`, then one provider instance registers via `registerEmailProvider(provider)` called from `apps/api/src/index.ts` boot sequence (before HTTP listener start), and `getEmailProvider()` throws with a clear "call registerEmailProvider at boot" message if invoked before registration.

2. **Resend provider implementation with configured env** — Given `EMAIL_PROVIDER=resend` and `RESEND_API_KEY` set, when the email service initializes via `createResendProvider(env)`, then the provider lazy-initializes a Resend client on first send (not at module import, to keep tests fast), exposes `send({ to, subject, react, tags, replyTo })` that renders the React Email component via `@react-email/render`, calls `resend.emails.send`, and returns `{ status: 'sent', providerMessageId }` on success or throws a `EmailSendError` with structured cause on provider error.

3. **Console provider default for dev/test/CI** — Given `NODE_ENV !== 'production'` and `EMAIL_PROVIDER` is unset or `=console`, when `send(opts)` is invoked, then the console provider renders the React Email template to HTML (so template rendering is still exercised in tests/dev), logs a structured Pino entry at `info` level with `{ provider: 'console', to, subject, template, renderedHtmlPreview: first200Chars }`, and returns `{ status: 'captured', providerMessageId: 'console-<uuid>' }` without any network call. Running the test suite must never require `RESEND_API_KEY`.

4. **Zod-validated env with fail-fast coupling** — Given the config layer at `apps/api/src/config.ts`, when env loads, then the schema is extended with: `EMAIL_PROVIDER` enum (`resend`|`console`|`postmark`, default `console`), `RESEND_API_KEY` optional string min 1, `EMAIL_FROM_ADDRESS` string email, `EMAIL_FROM_NAME` string min 1 default `"Kiln Insights"`, `EMAIL_REPLY_TO` optional string email, `EMAIL_MAILING_ADDRESS` string min 1 required for CAN-SPAM. A `.refine()` enforces: if `EMAIL_PROVIDER=resend`, then `RESEND_API_KEY` is required; if `NODE_ENV=production`, then `EMAIL_PROVIDER` must be `resend` (can't ship console to prod); `EMAIL_MAILING_ADDRESS` always required. A second refine mirrors the existing Stripe pattern — fail-fast at boot, not at send time.

5. **Send-path error handling with structured context** — Given any provider call fails (5xx, network timeout, rate limit, invalid from-address), when `send()` is invoked, then (a) the error is logged at `error` level with `{ correlationId, provider, template, to: to.replace(/(.{2}).+(@.+)/, '$1***$2'), errorCode, errorMessage, providerStatusCode }` — recipient is partially redacted in logs to keep PII minimal, (b) the error is wrapped in `EmailSendError` with `retryable: boolean` discriminant (5xx + network = retryable, 4xx validation = not retryable), and (c) the error bubbles to the caller so BullMQ jobs can let their existing retry policy handle it — this service does not implement its own retry loop.

6. **Observability: one log line per send attempt** — Given any send is invoked (success or failure, any provider), when the send completes, then exactly one Pino log entry captures the full send path with `{ correlationId, template, to: redactedTo, provider, outcome: 'sent' | 'failed' | 'captured', providerMessageId, durationMs }`. Multi-line stack traces from error paths attach via Pino's `err` serializer, not a separate log line. An operator grepping `template=digest-weekly outcome=failed` must find every failure in one grep.

7. **Postmark interface stub (binding only, no implementation)** — Given the provider abstraction design, when a future story swaps Resend for Postmark, then only `apps/api/src/services/email/provider.ts` binding logic changes. This story ships an empty `createPostmarkProvider` that throws `"Not implemented — Story [TBD]"` to prove the factory pattern compiles, but does NOT install `postmark` npm package or implement SDK calls. Just the factory-switch seam.

8. **React Email dependencies added with pinned major versions** — Given `apps/api/package.json`, when this story ships, then `@react-email/components@^0.x` and `@react-email/render@^1.x` are added as runtime deps (not devDeps — production renders templates), locked to the latest stable major. The existing `resend@^6.12.0` stays as-is. Verify via `pnpm install` clean install from root; no peer-dep warnings, no transitive conflicts with React 19.2.

9. **`sendEmail` public API with typed options** — Given `apps/api/src/services/email/index.ts`, when consumers import `sendEmail`, then the exported function signature is `sendEmail(opts: SendEmailOpts): Promise<SendResult>` where `SendEmailOpts` is `{ to: string | string[]; subject: string; react: React.ReactElement; tags?: Record<string, string>; replyTo?: string; correlationId?: string }`. All consumers use this path; no consumer imports `resend` or `@react-email/render` directly after this story. A lint rule or code-review guard enforces this (deferred — documented, not implemented in 9.1).

10. **Health check integration** — Given the existing `/api/health` endpoint at `apps/api/src/routes/health.ts`, when the email provider registers, then the health endpoint's response body includes an `email: { provider: string, status: 'ok' | 'degraded' | 'error', latencyMs: number }` field. For the console provider, `status` is always `ok` with `latencyMs: 0`. For the Resend provider, `checkHealth()` does a no-op probe (a domain verification read, not an actual send) — if Resend's API is unreachable, status is `error` and the overall health endpoint still returns 200 (fail-open, consistent with the rate-limiter posture), but the degraded status is captured for ops.

11. **Test coverage: provider unit + integration** — Given the Vitest config at `apps/api/vitest.config.ts`, when tests run, then (a) unit tests cover `createConsoleProvider` (render + log + return captured), `createResendProvider` with mocked `resend` client (success, 5xx, 4xx, network timeout paths), `registerEmailProvider` / `getEmailProvider` lifecycle including the "not registered" error, config validation (refine rules for prod + resend coupling), and (b) an integration test exercises `sendEmail` end-to-end with the console provider and a tiny React Email fixture template to prove the render path works without Resend. **Completion bar**: every error path, every branch, every provider exercised by at least one named test — no `.skip`, no `.todo`, no `expect.anything()`-stubs left in the tree. Numeric coverage is a lagging indicator; named-path coverage is the real target. All tests run without `RESEND_API_KEY` set.

12. **Dev-mode capture file (optional QoL)** — Given `EMAIL_PROVIDER=console` and `EMAIL_CAPTURE_DIR` env var is set, when a send occurs in dev, then the rendered HTML is additionally written to `${EMAIL_CAPTURE_DIR}/<timestamp>-<template>.html` for visual inspection in a browser. If `EMAIL_CAPTURE_DIR` is unset, logs-only (AC #3 behavior). This is a dev-ergonomics feature — not required for CI or production, but massively speeds up template iteration in 9.3.

13. **Privacy boundary**: email service accepts only rendered React components + recipient data — it does NOT receive `ComputedStat[]` or `DataRow[]`. Template rendering happens at the caller (digest generator in 9.2). This keeps the email service free of business-logic coupling and preserves the NFR12 privacy boundary.

14. **Documentation hooks** — Given the ALWAYS-ON `humanize-code` + `interview-docs` mandates, when this story lands code, then (a) every new `.ts` file in `services/email/` gets a companion `<filename>_explained.md` with the 8-section interview doc format, (b) the `architecture.md` gets a new short subsection under the existing services layout documenting the email service boundary + provider swap seam, (c) the `project-context.md` gets a new rule: "Never call `resend` SDK or `@react-email/render` directly from a route handler, service, or job — always go through `sendEmail(opts)` in `services/email/index.ts`. Provider swaps touch one file: `provider.ts`."

## Tasks / Subtasks

- [ ] **Task 1**: Env + config extension (AC: #4)
  - [ ] 1.1 Open `apps/api/src/config.ts`. Add to the zod schema: `EMAIL_PROVIDER: z.enum(['resend', 'console', 'postmark']).default('console')`, `EMAIL_FROM_ADDRESS: z.string().email()`, `EMAIL_FROM_NAME: z.string().min(1).default('Kiln Insights')`, `EMAIL_REPLY_TO: z.string().email().optional()`, `EMAIL_MAILING_ADDRESS: z.string().min(1)`. Keep `RESEND_API_KEY` as-is (already present + optional).
  - [ ] 1.2 Add optional `EMAIL_CAPTURE_DIR: z.string().optional()` for AC #12.
  - [ ] 1.3 Add `.refine()` rule: if `EMAIL_PROVIDER === 'resend'` then `RESEND_API_KEY` must be set. Error path `['EMAIL_PROVIDER']` with message "RESEND_API_KEY required when EMAIL_PROVIDER=resend."
  - [ ] 1.4 Add `.refine()` rule: if `NODE_ENV === 'production'` then `EMAIL_PROVIDER !== 'console'`. Message "EMAIL_PROVIDER=console is not permitted in production — set EMAIL_PROVIDER=resend."
  - [ ] 1.5 Do NOT churn the existing `emailDigest/` gates. Keep `DIGEST_FROM_EMAIL` and `isDigestConfigured(cfg)` untouched — both retire with the scaffolding in Story 9.2. Add a single comment next to `DIGEST_FROM_EMAIL`: `// deprecated by EMAIL_FROM_ADDRESS (Story 9.1); removed in Story 9.2 after emailDigest/ retires.`
  - [ ] 1.6 Update `.env.example` with the new vars + comments explaining dev/CI defaults.
  - [ ] 1.7 Add a minimal test in `apps/api/src/config.test.ts` (create file if absent) asserting the two refine rules fire with correct error messages. Parse with known bad inputs; expect `z.ZodError`.

- [ ] **Task 2**: Provider interface + lifecycle (AC: #1, #7)
  - [ ] 2.1 Create `apps/api/src/services/email/provider.ts`. Model after `apps/api/src/services/aiInterpretation/provider.ts` (already exists — same pattern: interface + module-level active provider + `register` / `get` / `reset` functions).
  - [ ] 2.2 Export interface `EmailProvider` with `name: string`, `send(opts: SendEmailOpts): Promise<SendResult>`, `checkHealth(): Promise<ProviderHealth>`.
  - [ ] 2.3 Export `SendEmailOpts` type `{ to: string | string[]; subject: string; react: React.ReactElement; tags?: Record<string, string>; replyTo?: string; correlationId?: string }`.
  - [ ] 2.4 Export `SendResult` type `{ status: 'sent' | 'captured'; providerMessageId: string; durationMs: number }`.
  - [ ] 2.5 Export `ProviderHealth` type `{ status: 'ok' | 'degraded' | 'error'; latencyMs: number; detail?: string }`.
  - [ ] 2.6 Export `EmailSendError extends Error` with `retryable: boolean`, `providerStatusCode?: number`, `cause?: unknown` (use native `Error.cause`).
  - [ ] 2.7 Module-level `activeProvider: EmailProvider | null = null`; `registerEmailProvider(p)`, `getEmailProvider()` (throws if null), `resetEmailProvider()` (test-only, same pattern as LLM provider).
  - [ ] 2.8 Stub `createPostmarkProvider(env: Env): EmailProvider` that returns a provider whose `send` throws `new Error('Postmark provider not implemented — future story')`. Proves the factory pattern compiles. No `postmark` package install.
  - [ ] 2.9 Create `apps/api/src/services/email/provider.ts_explained.md` following the 8-section template.

- [ ] **Task 3**: Console provider implementation (AC: #3, #12)
  - [ ] 3.1 Create `apps/api/src/services/email/providers/console.ts` (subfolder for provider implementations keeps the root clean).
  - [ ] 3.2 Export `createConsoleProvider(env: Env, deps?: { logger?: Logger, clock?: () => number, fs?: Pick<typeof fsPromises, 'writeFile' | 'mkdir'> })`. Deps object is test-seam; in prod defaults resolve to real `logger`, `Date.now`, `fs/promises`.
  - [ ] 3.3 `send(opts)`: measure start time with `deps.clock()`, render `opts.react` via `@react-email/render` to HTML string (so the render path is actually exercised — catches template bugs in dev), build structured log `{ provider: 'console', template: opts.tags?.template ?? 'unknown', to: redactRecipient(opts.to), subject: opts.subject, renderedHtmlPreview: html.slice(0, 200), correlationId: opts.correlationId }`, emit at `info`. Compute `durationMs = deps.clock() - start`.
  - [ ] 3.4 If `env.EMAIL_CAPTURE_DIR`, write `${EMAIL_CAPTURE_DIR}/${timestamp}-${template ?? 'unknown'}.html`. Create dir if missing. Log at `debug` the captured file path. Any fs error on capture is caught and logged at `warn` — MUST NOT fail the send (dev ergonomics feature, not critical path).
  - [ ] 3.5 Return `{ status: 'captured', providerMessageId: 'console-' + crypto.randomUUID(), durationMs }`.
  - [ ] 3.6 `checkHealth()` returns `{ status: 'ok', latencyMs: 0 }` (console is always healthy).
  - [ ] 3.7 Helper `redactRecipient(to: string | string[])`: single email → mask local-part keeping first 2 chars (`ab***@domain.com`); array → map each. Pure function; tested separately. (Grepped for existing PII redactor on 2026-04-23 — confirmed absent. Add a file comment so a future reader knows it's intentionally local.)
  - [ ] 3.8 Unit tests in `apps/api/src/services/email/providers/console.test.ts`: send logs structured object at info, fs capture writes file when `EMAIL_CAPTURE_DIR` set, fs capture failure is swallowed, `providerMessageId` format matches `console-<uuid>`, `redactRecipient` handles string/array/edge-case empty.
  - [ ] 3.9 Create `console.ts_explained.md`.

- [ ] **Task 4**: Resend provider implementation (AC: #2, #5, #10)
  - [ ] 4.1 Create `apps/api/src/services/email/providers/resend.ts`.
  - [ ] 4.2 Export `createResendProvider(env: Env, deps?: { logger?: Logger, resend?: Resend, clock?: () => number })`. Deps seam allows injecting a mocked Resend client in tests.
  - [ ] 4.3 Lazy-init Resend client — `let client: Resend | null = null; function getClient() { return client ??= deps.resend ?? new Resend(env.RESEND_API_KEY) }`. Not at module import time (keeps cold-start fast, keeps tests import-clean).
  - [ ] 4.4 `send(opts)`: render `opts.react` → HTML via `@react-email/render`. Call `resend.emails.send({ from: \`${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM_ADDRESS}>\`, to: opts.to, subject: opts.subject, html, reply_to: opts.replyTo ?? env.EMAIL_REPLY_TO, tags: tagsToResendFormat(opts.tags) })`.
  - [ ] 4.5 On success (`{ data, error: null }`): log structured entry per AC #6, return `{ status: 'sent', providerMessageId: data.id, durationMs }`.
  - [ ] 4.6 On Resend error response (`{ error: { ... } }`): classify — 4xx = not retryable (`EmailSendError` with `retryable: false`), 5xx/429/network = retryable (`retryable: true`). Attach `error.statusCode` to `providerStatusCode`. Log at `error` level per AC #5. Throw.
  - [ ] 4.7 On thrown error (network failure, SDK bug): wrap in `EmailSendError` with `retryable: true` (assume transient). Log at `error` with `err` serializer attached.
  - [ ] 4.8 `checkHealth()`: measure latency of a lightweight Resend API probe. Resend's SDK doesn't expose a cheap health endpoint — use `resend.domains.list()` (returns domain list; fast; authenticated). Cache the result for 30s to avoid hammering Resend from the health endpoint. Return `{ status: 'ok'|'degraded'|'error', latencyMs, detail }`. On probe failure, return `error` but DO NOT throw — health check must not crash the health route.
  - [ ] 4.9 `tagsToResendFormat(tags?: Record<string, string>): { name: string; value: string }[] | undefined` — Resend expects array form.
  - [ ] 4.10 Sentry capture on non-retryable failure: `Sentry.captureException(err, { tags: { provider: 'email', template: opts.tags?.template ?? 'unknown', retryable: false } })` — matches the tag pattern established in commit `4c51140`. Retryable errors log only (avoids Sentry noise during 5xx storms). Mock Sentry in unit tests; assert call shape on 4xx path and no-call on 5xx path.
  - [ ] 4.11 Unit tests in `resend.test.ts`: mocked Resend client for each path (success, 5xx, 4xx, network throw, health probe success/failure), lazy-init is actually lazy (assert new Resend() not called until first send), tags serialize correctly, from-address composes correctly, Sentry called on 4xx only.
  - [ ] 4.12 Create `resend.ts_explained.md`.

- [ ] **Task 5**: Public API — `sendEmail` + barrel (AC: #9, #13)
  - [ ] 5.1 Create `apps/api/src/services/email/index.ts` exporting `sendEmail(opts)` (thin wrapper calling `getEmailProvider().send(opts)`), the types (`SendEmailOpts`, `SendResult`, `ProviderHealth`, `EmailSendError`), `registerEmailProvider`, `getEmailProvider`, `resetEmailProvider`. No direct export of provider implementations — callers go through `sendEmail`.
  - [ ] 5.2 Create `apps/api/src/services/email/init.ts` exporting `initEmailProvider(env: Env)` that builds the correct provider per `env.EMAIL_PROVIDER` and calls `registerEmailProvider`. This is the boot-time seam.
  - [ ] 5.3 Wire `initEmailProvider(env)` into `apps/api/src/index.ts` during boot sequence — place after logger + Redis init, before HTTP listener start. One call, synchronous.
  - [ ] 5.4 Barrel test `apps/api/src/services/email/index.test.ts`: integration path — `registerEmailProvider(createConsoleProvider(env))`, build a minimal React fixture template `<Html><Body>Hello {{name}}</Body></Html>`, call `sendEmail({ to: 'test@example.com', subject: 'Test', react: <Fixture name="Corey" />, tags: { template: 'test-fixture' }, correlationId: 'test-corr-1' })`, assert return shape + log capture.
  - [ ] 5.5 Create `index.ts_explained.md`.

- [ ] **Task 6**: Health check integration (AC: #10)
  - [ ] 6.1 Open `apps/api/src/routes/health.ts`. Add email provider check to the existing health aggregation (preserve the DB + Redis pattern).
  - [ ] 6.2 Call `getEmailProvider().checkHealth()` with a `Promise.race` 3s timeout; on timeout return `{ status: 'error', latencyMs: 3000, detail: 'health check timeout' }`. Don't block the health endpoint on a slow provider probe.
  - [ ] 6.3 Include `email: { provider, status, latencyMs }` in the response payload.
  - [ ] 6.4 Overall health endpoint returns 200 even if email is `error` (fail-open for degraded dependencies, matches rate-limiter + Redis posture). Document this in the route handler comment.
  - [ ] 6.5 Update `apps/api/src/routes/health.test.ts` with a new test: provider returns `error` → 200 response with `email.status: 'error'`.

- [ ] **Task 7**: Dependencies + package.json (AC: #8)
  - [ ] 7.1 From repo root: `pnpm add @react-email/components @react-email/render --filter api`. Pin to latest stable major. Verify resolved versions in `pnpm-lock.yaml` and commit the lockfile.
  - [ ] 7.2 Run `pnpm install` clean from root. No peer-dep warnings expected. Any warning about React 19.2 compat → investigate (React Email historically lags React majors; if blocking, check Context7 for their current stance).
  - [ ] 7.3 Confirm build passes: `pnpm --filter api build`.
  - [ ] 7.4 Confirm type-check passes: `pnpm --filter api type-check`.

- [ ] **Task 8**: Documentation (AC: #14)
  - [ ] 8.1 Create `architecture.md` subsection — under the existing `Services Layer` section, add "Email service (`services/email/`)" with a short description: provider abstraction, console/Resend/Postmark-stub implementations, boot-time registration, single-caller pattern, privacy boundary (accepts rendered React elements, never stats or rows).
  - [ ] 8.2 Update `_bmad-output/project-context.md` — new rule under "Mandatory Rules" or a new "Email" section: "Never call `resend` SDK or `@react-email/render` directly from a route handler, service, or job. Always go through `sendEmail(opts)` in `apps/api/src/services/email/index.ts`. Provider swaps touch one file (`services/email/init.ts` + a new `providers/*.ts`). Existing `apps/api/src/services/emailDigest/` predates this module and is scheduled for retirement in Story 9.2 — do not extend it."
  - [ ] 8.3 Create the six `_explained.md` files alongside each new `.ts` file (AC #14a) — provider.ts, console.ts, resend.ts, index.ts, init.ts, and one for the config.ts delta (append to existing config.ts_explained.md if it exists; create if it doesn't).

- [ ] **Task 9**: Existing emailDigest scaffolding — document intent, don't touch (AC: #13, prior scaffolding section)
  - [ ] 9.1 Add a file-header comment at the top of `apps/api/src/services/emailDigest/resendClient.ts`: `// PRIOR SCAFFOLDING — predates Story 9.1. New callers must use services/email/ instead. This module is scheduled for retirement in Story 9.2 when the new digest generator at apps/api/src/jobs/digest/ replaces this pipeline. Do not extend.`
  - [ ] 9.2 Same header in `digestService.ts`, `scheduler.ts`, `worker.ts`, `templates.ts`, `unsubscribeToken.ts`.
  - [ ] 9.3 Explicitly do NOT refactor, delete, or wire emailDigest/ through the new email service. That's 9.2's job.

- [ ] **Task 10**: Retro action item documentation (AC from epic plan)
  - [ ] 10.1 Add to `_bmad-output/implementation-artifacts/epic-9-retro-pending.md` (create if doesn't exist) a bullet under "Retroactive email unification": "Invite email (Story 1.5) and payment-failure email (Story 5.4) paths do not exist in code — they were planned but never implemented. If future business logic adds them, route through `services/email/` not `emailDigest/`. This retro item can be closed as vacuous when Epic 9 ships unless the business case emerges."

## Dev Notes

### Architecture Compliance

- **BFF proxy pattern preserved** — no new client-facing routes in this story. The email service is API-internal only. All sends originate server-side (digest cron in 9.2, alerts in Epic 10, etc.).
- **Pino structured logging** — all logs use the object-first pattern (`logger.info({ ctx }, 'message')`). No string concatenation. AC #6 enforces one log line per send.
- **Env via config.ts** — no `process.env` access in the email service. All env is passed through `env: Env` from config.ts. Tests inject mocked env.
- **No CORS middleware** — same-origin only; email service never hits the browser.
- **Express middleware order** — unchanged. Email service is service-layer, not middleware.
- **API response format** — unchanged. The health endpoint already follows the convention; email adds a nested field.
- **Import boundaries** — `apps/web` will never import from `services/email/`. Web triggers email via API routes (digest cron is server-only in 9.2).
- **Privacy boundary (NFR12)** — email service accepts rendered React elements + recipient data only. No `ComputedStat[]`, no `DataRow[]`. The privacy boundary is enforced at the curation pipeline (assembly.ts) not here; this service is downstream and never sees raw data.
- **ESM module resolution** — `apps/api` is `"type": "module"` in package.json. All relative imports MUST use `.js` suffix even when the source is `.ts` (existing convention: `import { logger } from '../../lib/logger.js'`). Omitting the extension compiles but breaks at runtime under Node's ESM loader.
- **Correlation ID source** — `opts.correlationId` flows from one of two places. In Express request paths: `req.correlationId` (set by `middleware/correlationId.ts`, already mounted first in the chain). In job/cron paths (BullMQ worker in 9.2, etc.): `crypto.randomUUID()` at job start. Each provider's `send()` falls back to `crypto.randomUUID()` if `opts.correlationId` is absent — defensive default, not an excuse for callers to omit it.
- **Retry contract for synchronous callers** — this service does NOT retry. BullMQ jobs (9.2, Epic 10 alerts) own retry semantics via their queue config. Synchronous callers (hypothetical: admin-triggered send from a route handler) have two options: catch `EmailSendError.retryable=true` and enqueue a BullMQ retry job, or surface the error to the user. **Recommendation**: all emails route through BullMQ. Direct `sendEmail` from a hot route-handler path is a code smell — prefer the enqueue pattern.

### Library / Framework Requirements

| Library | Version | Reason |
|---------|---------|--------|
| `resend` | `^6.12.0` (already present) | Primary provider. No upgrade needed in this story. |
| `@react-email/components` | `^0.x` (add) | Template building blocks. Pin major; React Email minor versions can be breaking. |
| `@react-email/render` | `^1.x` (add) | Server-side HTML render. Runtime dep (not dev). |
| `bullmq` | `^5.74.1` (already present) | Used by 9.2, not 9.1. Mentioned only because worker pattern will integrate with retry policy. |
| `zod` | `3.23.8` (already present, pinned) | Do NOT upgrade. Drizzle-zod compat. |

### File Structure Requirements

New files (all under `apps/api/src/services/email/`):

```
services/email/
├── index.ts                  # public API: sendEmail, types, registerEmailProvider, getEmailProvider
├── init.ts                   # initEmailProvider(env) — boot-time provider selection
├── provider.ts               # EmailProvider interface, active-provider singleton, types
├── providers/
│   ├── console.ts           # createConsoleProvider(env, deps) — dev/test/CI default
│   ├── resend.ts            # createResendProvider(env, deps) — production
│   ├── console.test.ts
│   ├── resend.test.ts
│   ├── console.ts_explained.md
│   └── resend.ts_explained.md
├── index.test.ts            # integration: registerEmailProvider + sendEmail with console
├── provider.test.ts         # lifecycle: register/get/reset, "not registered" error
├── index.ts_explained.md
├── provider.ts_explained.md
└── init.ts_explained.md
```

Files modified:
| File | Change |
|------|--------|
| `apps/api/src/config.ts` | Add email env vars + two `.refine()` rules + optional `EMAIL_CAPTURE_DIR` |
| `apps/api/src/index.ts` | Call `initEmailProvider(env)` at boot, after Redis init, before HTTP listen |
| `apps/api/src/routes/health.ts` | Add `email: { provider, status, latencyMs }` to health payload |
| `apps/api/src/routes/health.test.ts` | New test: email provider error → 200 with degraded status |
| `apps/api/package.json` | Add `@react-email/components`, `@react-email/render` |
| `pnpm-lock.yaml` | Commit updated lockfile |
| `.env.example` | Add email env vars with comments |
| `_bmad-output/planning-artifacts/architecture.md` | New email services subsection |
| `_bmad-output/project-context.md` | New rule re: email service usage |
| `apps/api/src/services/emailDigest/*.ts` | Add prior-scaffolding header comment only, no code changes |

### Testing Requirements

- All tests run in `apps/api/vitest.config.ts` (Node environment).
- Zero test relies on `RESEND_API_KEY` being set. The console provider + mocked Resend client cover every path.
- Target ≥90% line coverage on `services/email/`.
- Integration test exercises the full render → send → log pipeline with the console provider.
- Config test covers both `.refine()` rules.
- Health route test covers the email-degraded case.
- No snapshot tests on rendered HTML in this story (template stability is 9.3's concern).

### Previous Story Intelligence (Story 8.5 — `8-5-inline-chart-thumbnails-insight-mapping.md`)

Patterns that apply directly:
- **Provider abstraction** — `apps/api/src/services/aiInterpretation/provider.ts` is the reference pattern. Copy its shape: interface + module-level singleton + register/get/reset trio. Keep the test-reset seam (`resetEmailProvider`) for test hygiene.
- **Dependency-injection seam via `deps?` param** — test-reviewable pattern from 8.5's `createConsoleProvider(env, deps)`. Default resolves to real deps; tests inject mocks. Avoid global mocks.
- **Pino structured logging** — object-first convention enforced in code review (repeat finding from Epic 2–4 code reviews).
- **Fail-fast env validation** — extends the existing Stripe live-key refine pattern in config.ts. Keep consistency.
- **Lazy init** — mirror 8.5's discipline; don't construct SDK clients at module import time. Fast cold-start + clean test imports.
- **`_explained.md` companion docs** — ALWAYS-ON mandate. 8-section format per `/interview-docs` skill.

Anti-patterns observed in recent code reviews that apply here:
- **No `process.env` access outside config.ts** (repeated finding across Epic 4–8).
- **No `console.log`** — Pino only (Epic 2 finding).
- **No `String + variable` in log messages** — structured object first (Epic 3 finding).
- **Error handling**: catch specific errors you can handle; let framework errors propagate. Don't log-and-rethrow without adding context.

### Git Intelligence (last 5 commits)

| Commit | Relevance |
|--------|-----------|
| `514bc28` docs(bmad): epic 9 sprint planning + 3 decisions resolved | Direct — this story implements part of that sprint plan. |
| `afe9314` docs(bmad): draft epic 9 weekly email digest | Direct — draft scope that became this epic. |
| `4c51140` feat(audit): Tier A coverage sweep + auditSystem + Sentry tag refinement | Pattern — auditSystem helper is a good reference for how to add a service-layer helper cleanly. Sentry tag pattern applies if email failures should tag to Sentry. |
| `d13e3ce` / `85b3e3a` fix(e2e): saveCashBalance flow | Reference — shows current E2E test conventions. No E2E tests for 9.1 (no UI surface). |

Commits that predate the formal Epic 9 scope and are directly relevant to this story:
- `a8628d1` feat: add weekly email digest and integrations settings page — landed the prior `emailDigest/` scaffolding. **Read before starting**.
- `37de6e8` feat: add Sentry user context, audit logging, and digest tests — landed `emailDigest/` tests. Shows the test shape used for the prior work.

### Latest Tech Information

- **Resend SDK v6**: API shape at the time of writing returns `{ data: { id: string } | null, error: { name: string, message: string, statusCode: number } | null }` from `.emails.send()`. Handle both branches (classic discriminated-union pattern). The SDK internally retries nothing — we own retries (via BullMQ in downstream stories).
- **React Email v1**: `@react-email/render` is ESM-first; if your tsconfig has `module: "CommonJS"`, confirm the runtime import works. The API already runs ESM (`"type": "module"` in package.json, per tsconfig and build script), so this should be seamless.
- **React 19.2 + React Email**: React Email officially supports React 18 at time of writing. React 19.2 is not yet blessed. The templates don't use any React 19-specific features; should render fine. Verify in integration test (Task 5.4). If a peer-dep warning blocks install, check Context7 for React Email's current React 19 status before downgrading.
- **Pinned Zod 3.x** — do not import Zod 4 features. All new schema code uses `.refine()` + chained validators, which are Zod 3.x-compatible.

### Project Structure Notes

- Alignment: `services/email/` follows the same layout as `services/curation/`, `services/aiInterpretation/`, `services/analytics/` — barrel at root, subdirs for domain concerns, colocated tests, colocated `_explained.md`.
- Variance: `providers/` subdirectory is new. `aiInterpretation/` keeps its single provider at root (`claudeClient.ts`). Rationale: email has three implementations (console + Resend + Postmark-stub) so a subdir keeps the root clean. Flag to reviewer: acceptable deviation or should we flatten?

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Story 9.1`] — full AC + technical notes
- [Source: `_bmad-output/planning-artifacts/epics.md#Epic 9`] — epic context + sprint-planning decisions
- [Source: `apps/api/src/services/aiInterpretation/provider.ts`] — reference pattern for provider abstraction
- [Source: `apps/api/src/config.ts`] — env validation pattern + existing Stripe `.refine()` rule
- [Source: `apps/api/src/services/emailDigest/`] — prior scaffolding; read for context but do not extend
- [Source: `CLAUDE.md#Mandatory Rules`] — Pino logging convention, env access rules, import boundaries
- [Source: `_bmad-output/project-context.md`] — full project rule catalog
- [Source: `MEMORY.md#Always-Active Skills`] — `humanize-code`, `interview-docs`, `humanizer` are ALWAYS-ON

## Dev Agent Record

### Agent Model Used

<!-- Set by dev agent when implementing -->

### Debug Log References

<!-- Populated during implementation -->

### Completion Notes List

<!-- Populated during implementation -->

### File List

<!-- Populated during implementation -->
