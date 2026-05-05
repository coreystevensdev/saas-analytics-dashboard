import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockWorkerClose = vi.fn().mockResolvedValue(undefined);
const mockWorkerOn = vi.fn();
const mockHandleOrchestratorJob = vi.fn().mockResolvedValue(undefined);
const mockHandlePerOrgJob = vi.fn().mockResolvedValue(undefined);
const mockHandlePerSendJob = vi.fn().mockResolvedValue(undefined);

interface WorkerCall {
  name: string;
  processor: (job: unknown) => Promise<unknown>;
  opts: { concurrency: number; limiter?: { max: number; duration: number } };
}
const workerCalls: WorkerCall[] = [];

class FakeWorker {
  close = mockWorkerClose;
  on = mockWorkerOn;
  constructor(
    public name: string,
    processor: (job: unknown) => Promise<unknown>,
    opts: WorkerCall['opts'],
  ) {
    workerCalls.push({ name, processor, opts });
  }
}

vi.mock('bullmq', () => ({
  Queue: class { constructor(public name: string, public opts: unknown) {} },
  Worker: FakeWorker,
}));

vi.mock('../../config.js', () => ({ env: { REDIS_URL: 'redis://localhost:6379' } }));
vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('./handlers/orchestrator.js', () => ({ handleOrchestratorJob: mockHandleOrchestratorJob }));
vi.mock('./handlers/perOrg.js', () => ({ handlePerOrgJob: mockHandlePerOrgJob }));
vi.mock('./handlers/perSend.js', () => ({ handlePerSendJob: mockHandlePerSendJob }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  workerCalls.length = 0;
});

function findWorker(name: string): WorkerCall {
  const w = workerCalls.find((c) => c.name === name);
  if (!w) throw new Error(`No worker registered for ${name}`);
  return w;
}

describe('initDigestOrchestratorWorker', () => {
  it('binds to the orchestrator queue with concurrency 1', async () => {
    const { initDigestOrchestratorWorker } = await import('./workers.js');
    initDigestOrchestratorWorker();

    const w = findWorker('digest-orchestrator');
    expect(w.opts.concurrency).toBe(1);
    expect(w.opts.limiter).toBeUndefined();
  });

  it('is idempotent on repeat init calls', async () => {
    const { initDigestOrchestratorWorker } = await import('./workers.js');
    const a = initDigestOrchestratorWorker();
    const b = initDigestOrchestratorWorker();
    expect(a).toBe(b);
  });

  it('delegates to handleOrchestratorJob', async () => {
    const { initDigestOrchestratorWorker } = await import('./workers.js');
    initDigestOrchestratorWorker();

    const w = findWorker('digest-orchestrator');
    const job = { id: 'orch-1' };
    await w.processor(job);
    expect(mockHandleOrchestratorJob).toHaveBeenCalledWith(job);
  });
});

describe('initDigestOrgWorker', () => {
  it('binds to the org queue with concurrency 3', async () => {
    const { initDigestOrgWorker } = await import('./workers.js');
    initDigestOrgWorker();

    const w = findWorker('digest-org');
    expect(w.opts.concurrency).toBe(3);
    expect(w.opts.limiter).toBeUndefined();
  });

  it('delegates to handlePerOrgJob', async () => {
    const { initDigestOrgWorker } = await import('./workers.js');
    initDigestOrgWorker();

    const w = findWorker('digest-org');
    const job = { id: 'org-1' };
    await w.processor(job);
    expect(mockHandlePerOrgJob).toHaveBeenCalledWith(job);
  });

  it('is idempotent on repeat init calls', async () => {
    const { initDigestOrgWorker } = await import('./workers.js');
    const a = initDigestOrgWorker();
    const b = initDigestOrgWorker();
    expect(a).toBe(b);
  });
});

describe('initDigestSendWorker', () => {
  it('binds to the send queue with concurrency 10 + rate limiter 10/sec', async () => {
    const { initDigestSendWorker } = await import('./workers.js');
    initDigestSendWorker();

    const w = findWorker('digest-send');
    expect(w.opts.concurrency).toBe(10);
    expect(w.opts.limiter).toEqual({ max: 10, duration: 1_000 });
  });

  it('delegates to handlePerSendJob', async () => {
    const { initDigestSendWorker } = await import('./workers.js');
    initDigestSendWorker();

    const w = findWorker('digest-send');
    const job = { id: 'send-1' };
    await w.processor(job);
    expect(mockHandlePerSendJob).toHaveBeenCalledWith(job);
  });

  it('is idempotent on repeat init calls', async () => {
    const { initDigestSendWorker } = await import('./workers.js');
    const a = initDigestSendWorker();
    const b = initDigestSendWorker();
    expect(a).toBe(b);
  });
});

describe('shutdownDigestWorkers', () => {
  it('closes every initialized worker', async () => {
    const {
      initDigestOrchestratorWorker,
      initDigestOrgWorker,
      initDigestSendWorker,
      shutdownDigestWorkers,
    } = await import('./workers.js');
    initDigestOrchestratorWorker();
    initDigestOrgWorker();
    initDigestSendWorker();

    await shutdownDigestWorkers();

    expect(mockWorkerClose).toHaveBeenCalledTimes(3);
  });

  it('is a no-op when nothing is initialized', async () => {
    const { shutdownDigestWorkers } = await import('./workers.js');
    await shutdownDigestWorkers();
    expect(mockWorkerClose).not.toHaveBeenCalled();
  });
});
