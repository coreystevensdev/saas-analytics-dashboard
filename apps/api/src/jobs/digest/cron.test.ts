import { describe, it, expect, vi, beforeEach } from 'vitest';

// Models BullMQ's repeat-key dedupe behavior: every queue.add with a
// repeat.key inserts into the same key slot, so calling add twice with the
// same key produces ONE repeatable job, not two. This lets the idempotency
// test assert AC #1 ("getRepeatableJobs returns exactly one entry") instead
// of the weaker "we always pass the right options" form.
interface RepeatableJobMeta {
  key: string;
  pattern: string;
  name: string;
}

const repeatableJobs = new Map<string, RepeatableJobMeta>();

const mockQueueAdd = vi.fn(
  async (
    name: string,
    _data: unknown,
    opts: { repeat?: { pattern: string; key: string } },
  ) => {
    if (opts?.repeat?.key) {
      // Same key on a second add overwrites the slot but the slot count is one.
      repeatableJobs.set(opts.repeat.key, {
        key: opts.repeat.key,
        pattern: opts.repeat.pattern,
        name,
      });
    }
    return undefined;
  },
);
const mockQueueClose = vi.fn().mockResolvedValue(undefined);
const mockRemoveJobScheduler = vi.fn(async (key: string) => {
  return repeatableJobs.delete(key);
});
const mockGetRepeatableJobs = vi.fn(async () => Array.from(repeatableJobs.values()));

class FakeQueue {
  add = mockQueueAdd;
  close = mockQueueClose;
  removeJobScheduler = mockRemoveJobScheduler;
  getRepeatableJobs = mockGetRepeatableJobs;
  constructor(public name: string, public opts: unknown) {}
}

vi.mock('bullmq', () => ({ Queue: FakeQueue }));
vi.mock('../../config.js', () => ({ env: { REDIS_URL: 'redis://localhost:6379' } }));
vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  repeatableJobs.clear();
});

describe('initDigestCronJob', () => {
  it('registers the repeatable cron job with the right pattern + key', async () => {
    const { initDigestCronJob } = await import('./cron.js');

    await initDigestCronJob();

    expect(mockQueueAdd).toHaveBeenCalledWith(
      'digest-orchestrator',
      expect.objectContaining({ correlationId: 'cron-bootstrap' }),
      expect.objectContaining({
        repeat: expect.objectContaining({ pattern: '0 18 * * 0', key: 'digest-orchestrator' }),
        attempts: 3,
        backoff: expect.objectContaining({ type: 'exponential', delay: 60_000 }),
      }),
    );
  });

  it('is idempotent across two calls (AC #1: getRepeatableJobs returns one entry)', async () => {
    const { initDigestCronJob } = await import('./cron.js');
    const { getOrchestratorQueue } = await import('./queue.js');

    await initDigestCronJob();
    await initDigestCronJob();

    // The mock Queue models BullMQ's repeat-key dedupe semantic: same key on
    // a second add lands in the same slot. AC #1's behavioral assertion holds
    // here without needing a real Redis.
    const queue = getOrchestratorQueue() as unknown as FakeQueue;
    const jobs = await queue.getRepeatableJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ key: 'digest-orchestrator', pattern: '0 18 * * 0' });
  });

  it('keeps repeat.key and jobId aligned so future migrations stay safe', async () => {
    const { initDigestCronJob } = await import('./cron.js');
    await initDigestCronJob();

    const opts = mockQueueAdd.mock.calls[0]![2] as unknown as {
      repeat: { key: string };
      jobId: string;
    };
    // Two pieces of state on the same registration must stay aligned, otherwise
    // a graceful shutdown's removeJobScheduler(key) would leave the scheduled
    // job entry orphaned in Redis under a different jobId.
    expect(opts.jobId).toBe(opts.repeat.key);
  });

  it('re-registering after shutdown lands a fresh single repeatable', async () => {
    const { initDigestCronJob, shutdownDigestCron } = await import('./cron.js');
    const { getOrchestratorQueue } = await import('./queue.js');

    await initDigestCronJob();
    await shutdownDigestCron();

    const queue = getOrchestratorQueue() as unknown as FakeQueue;
    expect(await queue.getRepeatableJobs()).toHaveLength(0);

    await initDigestCronJob();
    expect(await queue.getRepeatableJobs()).toHaveLength(1);
  });
});

describe('shutdownDigestCron', () => {
  it('removes the scheduler by key', async () => {
    const { shutdownDigestCron } = await import('./cron.js');

    await shutdownDigestCron();

    expect(mockRemoveJobScheduler).toHaveBeenCalledWith('digest-orchestrator');
  });
});
