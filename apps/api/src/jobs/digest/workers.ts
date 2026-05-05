import { Worker } from 'bullmq';
import type { Job } from 'bullmq';

import { logger } from '../../lib/logger.js';
import { connectionOptions, QUEUE_ORCHESTRATOR, QUEUE_ORG, QUEUE_SEND } from './queue.js';
import { handleOrchestratorJob } from './handlers/orchestrator.js';
import { handlePerOrgJob } from './handlers/perOrg.js';
import { handlePerSendJob } from './handlers/perSend.js';

const ORCHESTRATOR_CONCURRENCY = 1;
const ORG_CONCURRENCY = 3;
const SEND_CONCURRENCY = 10;

// Send worker rate limiter: caps outbound mail at 10/sec in-process. Two-layer
// defense: (1) limiter throttles below Resend's plan tier; (2) Resend 429s
// classify as retryable EmailSendError so BullMQ backoff handles any miss.
// Tune `max` down if Story 9.5 surfaces sustained 429 metrics.
const SEND_LIMITER_MAX = 10;
const SEND_LIMITER_DURATION_MS = 1_000;

let orchestratorWorker: Worker | null = null;
let orgWorker: Worker | null = null;
let sendWorker: Worker | null = null;

function attachStandardListeners(worker: Worker, label: string): void {
  worker.on('failed', (job, err) => {
    logger.error(
      { label, jobId: job?.id, attemptsMade: job?.attemptsMade, err },
      'Digest worker job failed',
    );
  });
  worker.on('error', (err) => {
    logger.error({ label, err }, 'Digest worker error');
  });
}

export function initDigestOrchestratorWorker(): Worker {
  if (orchestratorWorker) return orchestratorWorker;

  orchestratorWorker = new Worker(
    QUEUE_ORCHESTRATOR,
    async (job: Job) => handleOrchestratorJob(job),
    {
      connection: connectionOptions(),
      concurrency: ORCHESTRATOR_CONCURRENCY,
    },
  );
  attachStandardListeners(orchestratorWorker, 'orchestrator');
  logger.info({ concurrency: ORCHESTRATOR_CONCURRENCY }, 'Digest orchestrator worker started');
  return orchestratorWorker;
}

export function initDigestOrgWorker(): Worker {
  if (orgWorker) return orgWorker;

  orgWorker = new Worker(
    QUEUE_ORG,
    async (job: Job) => handlePerOrgJob(job),
    {
      connection: connectionOptions(),
      concurrency: ORG_CONCURRENCY,
    },
  );
  attachStandardListeners(orgWorker, 'org');
  logger.info({ concurrency: ORG_CONCURRENCY }, 'Digest org worker started');
  return orgWorker;
}

export function initDigestSendWorker(): Worker {
  if (sendWorker) return sendWorker;

  sendWorker = new Worker(
    QUEUE_SEND,
    async (job: Job) => handlePerSendJob(job),
    {
      connection: connectionOptions(),
      concurrency: SEND_CONCURRENCY,
      limiter: { max: SEND_LIMITER_MAX, duration: SEND_LIMITER_DURATION_MS },
    },
  );
  attachStandardListeners(sendWorker, 'send');
  logger.info(
    { concurrency: SEND_CONCURRENCY, limiterMax: SEND_LIMITER_MAX, limiterDurationMs: SEND_LIMITER_DURATION_MS },
    'Digest send worker started',
  );
  return sendWorker;
}

export async function shutdownDigestWorkers(): Promise<void> {
  const tasks: Promise<unknown>[] = [];
  if (orchestratorWorker) {
    logger.info({}, 'Closing digest orchestrator worker');
    tasks.push(orchestratorWorker.close());
  }
  if (orgWorker) {
    logger.info({}, 'Closing digest org worker');
    tasks.push(orgWorker.close());
  }
  if (sendWorker) {
    logger.info({}, 'Closing digest send worker');
    tasks.push(sendWorker.close());
  }
  await Promise.allSettled(tasks);
  orchestratorWorker = null;
  orgWorker = null;
  sendWorker = null;
}
