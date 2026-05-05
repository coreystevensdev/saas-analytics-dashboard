import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQueueAdd = vi.fn().mockResolvedValue(undefined);
const mockQueueClose = vi.fn().mockResolvedValue(undefined);
const mockRemoveJobScheduler = vi.fn().mockResolvedValue(true);

class FakeQueue {
  add = mockQueueAdd;
  close = mockQueueClose;
  removeJobScheduler = mockRemoveJobScheduler;
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

  it('is idempotent across two calls in the same process (BullMQ repeat-key dedupes)', async () => {
    const { initDigestCronJob } = await import('./cron.js');

    await initDigestCronJob();
    await initDigestCronJob();

    // Both calls hit queue.add; BullMQ dedupes server-side via the repeat key.
    // Asserting two add calls + identical repeat key proves we always pass the
    // dedupe-enabling option, not that we manually skip the second call.
    expect(mockQueueAdd).toHaveBeenCalledTimes(2);
    const firstCall = mockQueueAdd.mock.calls[0]!;
    const secondCall = mockQueueAdd.mock.calls[1]!;
    expect((firstCall[2] as { repeat: { key: string } }).repeat.key).toBe('digest-orchestrator');
    expect((secondCall[2] as { repeat: { key: string } }).repeat.key).toBe('digest-orchestrator');
  });
});

describe('shutdownDigestCron', () => {
  it('removes the scheduler by key', async () => {
    const { shutdownDigestCron } = await import('./cron.js');

    await shutdownDigestCron();

    expect(mockRemoveJobScheduler).toHaveBeenCalledWith('digest-orchestrator');
  });
});
