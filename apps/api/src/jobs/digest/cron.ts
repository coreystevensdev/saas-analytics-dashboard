import { logger } from '../../lib/logger.js';
import {
  getOrchestratorQueue,
  JOB_ORCHESTRATOR,
} from './queue.js';

// Sunday 18:00 UTC. weekStart resolves to the same day's midnight, so the
// digest reports on the just-beginning week with content reflecting through
// the cron-tick moment. Operationally a Mon-Sun report mailed Sunday evening.
const CRON_PATTERN = '0 18 * * 0';
const REPEAT_KEY = 'digest-orchestrator';

const ATTEMPTS = 3;
const BACKOFF_MS = 60_000;

/**
 * Registers the weekly orchestrator cron. Idempotent: BullMQ's repeat.key
 * dedupes a second registration in the same process or across a pod restart
 * mid-tick. Safe to call on every boot.
 */
export async function initDigestCronJob(): Promise<void> {
  const queue = getOrchestratorQueue();

  await queue.add(
    JOB_ORCHESTRATOR,
    { correlationId: 'cron-bootstrap' },
    {
      repeat: { pattern: CRON_PATTERN, key: REPEAT_KEY },
      jobId: REPEAT_KEY,
      attempts: ATTEMPTS,
      backoff: { type: 'exponential', delay: BACKOFF_MS },
      removeOnComplete: { count: 50 },
      removeOnFail: { age: 30 * 86_400 },
    },
  );

  logger.info({ pattern: CRON_PATTERN, key: REPEAT_KEY }, 'Registered digest cron');
}

/** Removes the repeatable schedule. Useful for graceful shutdown or rotation. */
export async function shutdownDigestCron(): Promise<void> {
  const queue = getOrchestratorQueue();
  const removed = await queue.removeJobScheduler(REPEAT_KEY);
  logger.info({ removed }, 'Removed digest cron');
}
