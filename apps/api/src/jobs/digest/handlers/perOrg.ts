import type { Job } from 'bullmq';
import type { BusinessProfile } from 'shared/types';

import { logger } from '../../../lib/logger.js';
import {
  aiSummariesQueries,
  digestEligibilityQueries,
  orgsQueries,
} from '../../../db/queries/index.js';
import {
  runCurationPipeline,
  assemblePrompt,
  validateStatRefs,
  stripInvalidStatRefs,
  transparencyMetadataSchema,
} from '../../../services/curation/index.js';
import { generateInterpretation } from '../../../services/aiInterpretation/claudeClient.js';
import {
  getSendQueue,
  JOB_PREFIX_SEND,
  type OrgJobData,
  type SendJobData,
} from '../queue.js';

const DIGEST_PROMPT_VERSION = 'v1-digest';
const DIGEST_AUDIENCE = 'digest-weekly' as const;

const SEND_JOB_ATTEMPTS = 3;
const SEND_JOB_BACKOFF_MS = 30_000;

function sendJobName(userId: number, weekStart: Date): string {
  return `${JOB_PREFIX_SEND}-${userId}-${weekStart.getTime()}`;
}

/**
 * Per-org handler. Cache-first: if a digest summary already exists for this
 * (org, dataset, week), skip the curation pipeline and the LLM call. Either
 * way, fan out per-send jobs for eligible org members.
 */
export async function handlePerOrgJob(job: Job): Promise<void> {
  const { orgId, weekStart, weekEnd, correlationId } = job.data as OrgJobData;
  const start = Date.now();

  const datasetId = await orgsQueries.getActiveDatasetId(orgId);
  if (datasetId === null) {
    logger.warn(
      { correlationId, orgId, jobId: job.id },
      'Per-org digest skipped: org has no active dataset (lost between orchestrator + processing)',
    );
    return;
  }

  const org = await orgsQueries.findOrgById(orgId);
  if (!org) {
    logger.warn(
      { correlationId, orgId, jobId: job.id },
      'Per-org digest skipped: org row missing (deleted between orchestrator + processing)',
    );
    return;
  }

  logger.info(
    { correlationId, orgId, datasetId, weekStart, jobId: job.id },
    'Per-org digest started',
  );

  const cached = await aiSummariesQueries.getCachedDigest(orgId, datasetId, weekStart);
  let summaryId: number;
  let cacheHit: boolean;
  let insightCount: number;

  if (cached) {
    summaryId = cached.id;
    cacheHit = true;
    const meta = cached.transparencyMetadata as { statTypes?: unknown[] } | null;
    insightCount = Array.isArray(meta?.statTypes) ? meta!.statTypes!.length : 0;
  } else {
    const businessProfile = (org.businessProfile ?? null) as BusinessProfile | null;
    const financials = businessProfile
      ? {
          cashOnHand: businessProfile.cashOnHand,
          cashAsOfDate: businessProfile.cashAsOfDate,
          businessStartedDate: businessProfile.businessStartedDate,
          monthlyFixedCosts: businessProfile.monthlyFixedCosts,
        }
      : null;

    const insights = await runCurationPipeline(orgId, datasetId, undefined, financials);
    insightCount = insights.length;

    const { system, user, metadata } = assemblePrompt(
      insights,
      DIGEST_PROMPT_VERSION,
      businessProfile,
    );
    const validatedMetadata = transparencyMetadataSchema.parse(metadata);

    const content = await generateInterpretation({ system, user });
    const refReport = validateStatRefs(content, insights.map((i) => i.stat));
    const cleaned =
      refReport.invalidRefs.length > 0
        ? stripInvalidStatRefs(content, refReport.invalidRefs)
        : content;

    const stored = await aiSummariesQueries.storeSummary({
      orgId,
      datasetId,
      content: cleaned,
      metadata: validatedMetadata,
      promptVersion: DIGEST_PROMPT_VERSION,
      audience: DIGEST_AUDIENCE,
      weekStart,
    });
    summaryId = stored.id;
    cacheHit = false;
  }

  const recipients = await digestEligibilityQueries.findOrgRecipients(orgId);
  const queue = getSendQueue();

  let enqueued = 0;
  let enqueueFailures = 0;

  for (const r of recipients) {
    const data: SendJobData = {
      userId: r.userId,
      orgId,
      summaryId,
      weekStart,
      userEmail: r.email,
      orgName: org.name,
      correlationId,
    };

    try {
      await queue.add(sendJobName(r.userId, weekStart), data, {
        attempts: SEND_JOB_ATTEMPTS,
        backoff: { type: 'exponential', delay: SEND_JOB_BACKOFF_MS },
        removeOnComplete: { count: 100 },
        removeOnFail: { age: 30 * 86_400 },
      });
      enqueued++;
    } catch (err) {
      enqueueFailures++;
      logger.error(
        { correlationId, orgId, userId: r.userId, err },
        'Failed to enqueue digest-send job, continuing',
      );
    }
  }

  logger.info(
    {
      correlationId,
      orgId,
      datasetId,
      summaryId,
      cacheHit,
      insightCount,
      sendJobsEnqueued: enqueued,
      enqueueFailures,
      weekStart,
      weekEnd,
      durationMs: Date.now() - start,
    },
    'Per-org digest complete',
  );
}
