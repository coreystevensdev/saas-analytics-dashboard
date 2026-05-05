import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQueueClose = vi.fn().mockResolvedValue(undefined);

class FakeQueue {
  close = mockQueueClose;
  constructor(public name: string, public opts: unknown) {}
}

vi.mock('bullmq', () => ({ Queue: FakeQueue }));

vi.mock('../../config.js', () => ({
  env: { REDIS_URL: 'redis://:secret@localhost:6379' },
}));

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe('connectionOptions', () => {
  it('parses REDIS_URL into host/port/password', async () => {
    const { connectionOptions } = await import('./queue.js');
    const opts = connectionOptions();

    expect(opts).toMatchObject({
      host: 'localhost',
      port: 6379,
      password: 'secret',
      maxRetriesPerRequest: null,
    });
  });

  it('omits password when REDIS_URL has none', async () => {
    vi.doMock('../../config.js', () => ({
      env: { REDIS_URL: 'redis://localhost:6379' },
    }));
    const { connectionOptions } = await import('./queue.js');
    const opts = connectionOptions() as { password?: string };

    expect(opts.password).toBeUndefined();
  });
});

describe('queue singletons', () => {
  it('orchestrator queue is a singleton', async () => {
    const { getOrchestratorQueue } = await import('./queue.js');
    const q1 = getOrchestratorQueue();
    const q2 = getOrchestratorQueue();
    expect(q1).toBe(q2);
    expect((q1 as unknown as FakeQueue).name).toBe('digest-orchestrator');
  });

  it('org queue is a singleton with the right name', async () => {
    const { getOrgQueue } = await import('./queue.js');
    const q = getOrgQueue();
    expect((q as unknown as FakeQueue).name).toBe('digest-org');
  });

  it('send queue is a singleton with the right name', async () => {
    const { getSendQueue } = await import('./queue.js');
    const q = getSendQueue();
    expect((q as unknown as FakeQueue).name).toBe('digest-send');
  });

  it('the three queues are distinct instances', async () => {
    const { getOrchestratorQueue, getOrgQueue, getSendQueue } = await import('./queue.js');
    const a = getOrchestratorQueue();
    const b = getOrgQueue();
    const c = getSendQueue();
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
    expect(a).not.toBe(c);
  });
});

describe('closeQueues', () => {
  it('closes any initialized queues and resets singletons', async () => {
    const { getOrchestratorQueue, getOrgQueue, closeQueues, getSendQueue } =
      await import('./queue.js');
    getOrchestratorQueue();
    getOrgQueue();

    await closeQueues();

    expect(mockQueueClose).toHaveBeenCalledTimes(2);

    // After reset, getters return fresh instances.
    const fresh = getSendQueue();
    expect(fresh).toBeDefined();
  });

  it('is a no-op when no queues were initialized', async () => {
    const { closeQueues } = await import('./queue.js');
    await closeQueues();
    expect(mockQueueClose).not.toHaveBeenCalled();
  });
});
