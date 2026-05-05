import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetActiveDatasetId = vi.fn();
const mockFindOrgById = vi.fn();
const mockGetCachedDigest = vi.fn();
const mockStoreSummary = vi.fn();
const mockFindOrgRecipients = vi.fn();
const mockSendQueueAdd = vi.fn().mockResolvedValue(undefined);
const mockRunCurationPipeline = vi.fn();
const mockAssemblePrompt = vi.fn();
const mockGenerateInterpretation = vi.fn();
const mockValidateStatRefs = vi.fn();

vi.mock('bullmq', () => ({
  Queue: class { constructor(public name: string, public opts: unknown) {} },
}));

vi.mock('../../../config.js', () => ({ env: { REDIS_URL: 'redis://localhost:6379' } }));
vi.mock('../../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../db/queries/index.js', () => ({
  aiSummariesQueries: {
    getCachedDigest: mockGetCachedDigest,
    storeSummary: mockStoreSummary,
  },
  digestEligibilityQueries: {
    findOrgRecipients: mockFindOrgRecipients,
  },
  orgsQueries: {
    getActiveDatasetId: mockGetActiveDatasetId,
    findOrgById: mockFindOrgById,
  },
}));

vi.mock('../../../services/curation/index.js', () => ({
  runCurationPipeline: mockRunCurationPipeline,
  assemblePrompt: mockAssemblePrompt,
  validateStatRefs: mockValidateStatRefs,
  stripInvalidStatRefs: (text: string) => text,
  transparencyMetadataSchema: { parse: (m: unknown) => m },
}));

vi.mock('../../../services/aiInterpretation/claudeClient.js', () => ({
  generateInterpretation: mockGenerateInterpretation,
}));

vi.mock('../queue.js', async () => {
  const actual = await vi.importActual<typeof import('../queue.js')>('../queue.js');
  return {
    ...actual,
    getSendQueue: () => ({ add: mockSendQueueAdd }),
  };
});

const { handlePerOrgJob } = await import('./perOrg.js');

const baseOrg = {
  id: 42,
  name: 'Acme Coffee',
  businessProfile: null,
};

const baseJobData = {
  orgId: 42,
  weekStart: new Date('2026-05-03T00:00:00Z'),
  weekEnd: new Date('2026-05-09T23:59:59Z'),
  correlationId: 'corr-123',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockValidateStatRefs.mockReturnValue({ invalidRefs: [] });
  mockAssemblePrompt.mockReturnValue({
    system: 'sys',
    user: 'user prompt',
    metadata: { promptVersion: 'v1-digest', statTypes: ['Total', 'Trend'] },
  });
});

describe('cache miss path', () => {
  it('runs the curation pipeline and stores a digest summary', async () => {
    mockGetActiveDatasetId.mockResolvedValueOnce(100);
    mockFindOrgById.mockResolvedValueOnce(baseOrg);
    mockGetCachedDigest.mockResolvedValueOnce(undefined);
    mockRunCurationPipeline.mockResolvedValueOnce([{ stat: { statType: 'Total' } }]);
    mockGenerateInterpretation.mockResolvedValueOnce('- bullet 1\n- bullet 2\n- bullet 3');
    mockStoreSummary.mockResolvedValueOnce({ id: 999 });
    mockFindOrgRecipients.mockResolvedValueOnce([]);

    await handlePerOrgJob({ id: 'org-1', data: baseJobData } as never);

    expect(mockRunCurationPipeline).toHaveBeenCalledWith(42, 100, undefined, null);
    expect(mockAssemblePrompt).toHaveBeenCalledWith(
      [{ stat: { statType: 'Total' } }],
      'v1-digest',
      null,
    );
    expect(mockStoreSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 42,
        datasetId: 100,
        content: '- bullet 1\n- bullet 2\n- bullet 3',
        promptVersion: 'v1-digest',
        audience: 'digest-weekly',
        weekStart: baseJobData.weekStart,
      }),
    );
  });

  it('passes the financials subset from businessProfile to the pipeline', async () => {
    const orgWithProfile = {
      ...baseOrg,
      businessProfile: {
        cashOnHand: 50000,
        cashAsOfDate: '2026-05-01',
        businessStartedDate: '2024-01-01',
        monthlyFixedCosts: 8000,
      },
    };

    mockGetActiveDatasetId.mockResolvedValueOnce(100);
    mockFindOrgById.mockResolvedValueOnce(orgWithProfile);
    mockGetCachedDigest.mockResolvedValueOnce(undefined);
    mockRunCurationPipeline.mockResolvedValueOnce([]);
    mockGenerateInterpretation.mockResolvedValueOnce('');
    mockStoreSummary.mockResolvedValueOnce({ id: 1 });
    mockFindOrgRecipients.mockResolvedValueOnce([]);

    await handlePerOrgJob({ id: 'org-2', data: baseJobData } as never);

    expect(mockRunCurationPipeline).toHaveBeenCalledWith(
      42,
      100,
      undefined,
      expect.objectContaining({
        cashOnHand: 50000,
        cashAsOfDate: '2026-05-01',
        businessStartedDate: '2024-01-01',
        monthlyFixedCosts: 8000,
      }),
    );
  });
});

describe('cache hit path', () => {
  it('skips the pipeline and reuses the cached summary', async () => {
    mockGetActiveDatasetId.mockResolvedValueOnce(100);
    mockFindOrgById.mockResolvedValueOnce(baseOrg);
    mockGetCachedDigest.mockResolvedValueOnce({
      id: 555,
      content: 'cached',
      transparencyMetadata: { statTypes: ['Total', 'Trend'] },
    });
    mockFindOrgRecipients.mockResolvedValueOnce([]);

    await handlePerOrgJob({ id: 'org-3', data: baseJobData } as never);

    expect(mockRunCurationPipeline).not.toHaveBeenCalled();
    expect(mockGenerateInterpretation).not.toHaveBeenCalled();
    expect(mockStoreSummary).not.toHaveBeenCalled();
  });
});

describe('fan-out', () => {
  it('enqueues one digest-send job per recipient with summaryId only', async () => {
    mockGetActiveDatasetId.mockResolvedValueOnce(100);
    mockFindOrgById.mockResolvedValueOnce(baseOrg);
    mockGetCachedDigest.mockResolvedValueOnce({
      id: 555,
      content: 'cached',
      transparencyMetadata: {},
    });
    mockFindOrgRecipients.mockResolvedValueOnce([
      { userId: 1, email: 'a@x.com', name: 'Alice' },
      { userId: 2, email: 'b@x.com', name: 'Bob' },
    ]);

    await handlePerOrgJob({ id: 'org-4', data: baseJobData } as never);

    expect(mockSendQueueAdd).toHaveBeenCalledTimes(2);
    const firstPayload = mockSendQueueAdd.mock.calls[0]![1] as Record<string, unknown>;
    expect(firstPayload).toMatchObject({
      userId: 1,
      orgId: 42,
      summaryId: 555,
      userEmail: 'a@x.com',
      orgName: 'Acme Coffee',
      correlationId: 'corr-123',
    });

    // Privacy boundary: payload must NOT contain the summary content.
    expect(JSON.stringify(firstPayload)).not.toContain('cached');
  });

  it('continues fan-out when one enqueue throws (AC #4 isolation)', async () => {
    mockGetActiveDatasetId.mockResolvedValueOnce(100);
    mockFindOrgById.mockResolvedValueOnce(baseOrg);
    mockGetCachedDigest.mockResolvedValueOnce({ id: 555, content: '', transparencyMetadata: {} });
    mockFindOrgRecipients.mockResolvedValueOnce([
      { userId: 1, email: 'a@x.com', name: 'A' },
      { userId: 2, email: 'b@x.com', name: 'B' },
      { userId: 3, email: 'c@x.com', name: 'C' },
    ]);
    mockSendQueueAdd
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Redis blip'))
      .mockResolvedValueOnce(undefined);

    await expect(handlePerOrgJob({ id: 'org-5', data: baseJobData } as never)).resolves.toBeUndefined();

    expect(mockSendQueueAdd).toHaveBeenCalledTimes(3);
  });
});

describe('defensive paths', () => {
  it('exits cleanly when org has no active dataset', async () => {
    mockGetActiveDatasetId.mockResolvedValueOnce(null);

    await handlePerOrgJob({ id: 'org-6', data: baseJobData } as never);

    expect(mockFindOrgById).not.toHaveBeenCalled();
    expect(mockSendQueueAdd).not.toHaveBeenCalled();
  });

  it('exits cleanly when the org row is missing', async () => {
    mockGetActiveDatasetId.mockResolvedValueOnce(100);
    mockFindOrgById.mockResolvedValueOnce(undefined);

    await handlePerOrgJob({ id: 'org-7', data: baseJobData } as never);

    expect(mockGetCachedDigest).not.toHaveBeenCalled();
    expect(mockSendQueueAdd).not.toHaveBeenCalled();
  });

  it('lets DB errors during pipeline propagate so BullMQ retries', async () => {
    mockGetActiveDatasetId.mockResolvedValueOnce(100);
    mockFindOrgById.mockResolvedValueOnce(baseOrg);
    mockGetCachedDigest.mockResolvedValueOnce(undefined);
    const err = new Error('connection refused');
    mockRunCurationPipeline.mockRejectedValueOnce(err);

    await expect(handlePerOrgJob({ id: 'org-8', data: baseJobData } as never)).rejects.toBe(err);
  });
});
