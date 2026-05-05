import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockWorkerClose = vi.fn().mockResolvedValue(undefined);
const mockWorkerOn = vi.fn();
const mockHandleOrchestratorJob = vi.fn().mockResolvedValue(undefined);

let capturedProcessor: ((job: unknown) => Promise<unknown>) | null = null;
let capturedOpts: unknown = null;

class FakeWorker {
  close = mockWorkerClose;
  on = mockWorkerOn;
  constructor(
    public name: string,
    processor: (job: unknown) => Promise<unknown>,
    opts: unknown,
  ) {
    capturedProcessor = processor;
    capturedOpts = opts;
  }
}

vi.mock('bullmq', () => ({
  Queue: class FakeQueue { constructor(public name: string, public opts: unknown) {} },
  Worker: FakeWorker,
}));

vi.mock('../../config.js', () => ({ env: { REDIS_URL: 'redis://localhost:6379' } }));
vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('./handlers/orchestrator.js', () => ({
  handleOrchestratorJob: mockHandleOrchestratorJob,
}));

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  capturedProcessor = null;
  capturedOpts = null;
});

describe('initDigestOrchestratorWorker', () => {
  it('binds a worker to the orchestrator queue with concurrency 1', async () => {
    const { initDigestOrchestratorWorker } = await import('./workers.js');
    const w = initDigestOrchestratorWorker();

    expect(w).toBeDefined();
    expect((capturedOpts as { concurrency: number }).concurrency).toBe(1);
    expect(mockWorkerOn).toHaveBeenCalledWith('failed', expect.any(Function));
    expect(mockWorkerOn).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('returns the same worker on repeat init calls', async () => {
    const { initDigestOrchestratorWorker } = await import('./workers.js');
    const a = initDigestOrchestratorWorker();
    const b = initDigestOrchestratorWorker();
    expect(a).toBe(b);
  });

  it('processes jobs by delegating to handleOrchestratorJob', async () => {
    const { initDigestOrchestratorWorker } = await import('./workers.js');
    initDigestOrchestratorWorker();

    expect(capturedProcessor).toBeTruthy();
    const fakeJob = { id: 'cron-1', name: 'digest-orchestrator', data: {} };
    await capturedProcessor!(fakeJob);

    expect(mockHandleOrchestratorJob).toHaveBeenCalledWith(fakeJob);
  });

  it('lets handler errors propagate so BullMQ can retry', async () => {
    const err = new Error('eligibility query failed');
    mockHandleOrchestratorJob.mockRejectedValueOnce(err);

    const { initDigestOrchestratorWorker } = await import('./workers.js');
    initDigestOrchestratorWorker();

    await expect(capturedProcessor!({ id: 'cron-2', data: {} })).rejects.toBe(err);
  });
});

describe('shutdownDigestWorkers', () => {
  it('closes the orchestrator worker if initialized', async () => {
    const { initDigestOrchestratorWorker, shutdownDigestWorkers } = await import('./workers.js');
    initDigestOrchestratorWorker();

    await shutdownDigestWorkers();

    expect(mockWorkerClose).toHaveBeenCalled();
  });

  it('is a no-op when no worker was initialized', async () => {
    const { shutdownDigestWorkers } = await import('./workers.js');
    await shutdownDigestWorkers();
    expect(mockWorkerClose).not.toHaveBeenCalled();
  });
});
