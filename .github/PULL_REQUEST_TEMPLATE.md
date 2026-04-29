## What this changes

<!-- One or two sentences. Why first, what second. -->

## Notes for reviewers

<!-- Anything non-obvious: trade-offs considered, follow-up work intentionally deferred, areas you'd like sharper eyes on. -->

## Verification

- [ ] `pnpm lint` clean
- [ ] `pnpm type-check` clean
- [ ] `pnpm test` clean (Vitest)
- [ ] `pnpm exec playwright test` clean for affected E2E paths (or n/a)
- [ ] `docker compose up` smoke-tests the affected flow end-to-end
- [ ] No new env var without a corresponding entry in `.env.example` and `.env.ci`

## Privacy and security checks

- [ ] No raw rows reach the LLM. Anything sent to Claude is a computed statistic from the curation pipeline (`computation` → `scoring` → `assembly`).
- [ ] If a new table was added, it has an RLS policy keyed on `org_id`.
- [ ] If a new endpoint was added, it goes through the Next.js BFF proxy (no direct browser → Express).
- [ ] If a Stripe webhook handler was touched, signature verification still runs before any state mutation.

## Linked issue / story

<!-- Closes #N, or references the BMad story (e.g., "Story 9.2"). -->
