import { Worker } from 'bullmq';
import type { Job } from 'bullmq';

import { logger } from '../../lib/logger.js';
import { connectionOptions, QUEUE_ORCHESTRATOR } from './queue.js';
import { handleOrchestratorJob } from './handlers/orchestrator.js';

const ORCHESTRATOR_CONCURRENCY = 1;

let orchestratorWorker: Worker | null = null;

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

  orchestratorWorker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, attemptsMade: job?.attemptsMade, err },
      'Digest orchestrator job failed',
    );
  });

  orchestratorWorker.on('error', (err) => {
    logger.error({ err }, 'Digest orchestrator worker error');
  });

  logger.info({ concurrency: ORCHESTRATOR_CONCURRENCY }, 'Digest orchestrator worker started');
  return orchestratorWorker;
}

export async function shutdownDigestWorkers(): Promise<void> {
  const tasks: Promise<unknown>[] = [];
  if (orchestratorWorker) {
    logger.info({}, 'Closing digest orchestrator worker');
    tasks.push(orchestratorWorker.close());
  }
  await Promise.allSettled(tasks);
  orchestratorWorker = null;
}
