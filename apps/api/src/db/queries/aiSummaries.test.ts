import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindFirst = vi.fn();
const mockReturning = vi.fn();
const mockInsertValues = vi.fn(() => ({ returning: mockReturning }));

vi.mock('../../lib/db.js', () => ({
  db: {
    query: { aiSummaries: { findFirst: mockFindFirst } },
    insert: vi.fn(() => ({ values: mockInsertValues })),
    update: vi.fn(),
  },
}));

const { getCachedSummary, getCachedDigest, getLatestSummary, storeSummary } =
  await import('./aiSummaries.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getCachedSummary', () => {
  it('returns the cached row when present', async () => {
    const row = { id: 1, orgId: 7, datasetId: 9, audience: 'dashboard' };
    mockFindFirst.mockResolvedValueOnce(row);

    const result = await getCachedSummary(7, 9);

    expect(result).toEqual(row);
    expect(mockFindFirst).toHaveBeenCalledWith({ where: expect.anything() });
  });

  it('passes a custom client through (transactional reads)', async () => {
    const txQuery = { aiSummaries: { findFirst: vi.fn().mockResolvedValueOnce(undefined) } };
    const tx = { query: txQuery } as never;

    await getCachedSummary(7, 9, tx);

    expect(txQuery.aiSummaries.findFirst).toHaveBeenCalled();
    expect(mockFindFirst).not.toHaveBeenCalled();
  });
});

describe('getCachedDigest', () => {
  it('reads with weekStart pinned to the requested week', async () => {
    const weekStart = new Date('2026-05-03T00:00:00Z');
    const row = { id: 1, orgId: 7, datasetId: 9, audience: 'digest-weekly', weekStart };
    mockFindFirst.mockResolvedValueOnce(row);

    const result = await getCachedDigest(7, 9, weekStart);

    expect(result).toEqual(row);
    expect(mockFindFirst).toHaveBeenCalledOnce();
  });

  it('returns undefined on cache miss', async () => {
    mockFindFirst.mockResolvedValueOnce(undefined);

    const result = await getCachedDigest(7, 9, new Date('2026-05-03T00:00:00Z'));

    expect(result).toBeUndefined();
  });
});

describe('getLatestSummary', () => {
  it('returns the most recent dashboard row regardless of staleness', async () => {
    const row = { id: 1, audience: 'dashboard', staleAt: new Date() };
    mockFindFirst.mockResolvedValueOnce(row);

    const result = await getLatestSummary(7, 9);

    expect(result).toEqual(row);
  });
});

describe('storeSummary (options bag)', () => {
  it('writes with dashboard defaults', async () => {
    const inserted = { id: 1 };
    mockReturning.mockResolvedValueOnce([inserted]);

    await storeSummary({
      orgId: 7,
      datasetId: 9,
      content: 'fresh insights',
      metadata: { promptVersion: 'v1.6' },
      promptVersion: 'v1.6',
    });

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 7,
        datasetId: 9,
        content: 'fresh insights',
        promptVersion: 'v1.6',
        isSeed: false,
        audience: 'dashboard',
        weekStart: null,
      }),
    );
  });

  it('writes a digest row with audience + weekStart', async () => {
    mockReturning.mockResolvedValueOnce([{ id: 2 }]);
    const weekStart = new Date('2026-05-03T00:00:00Z');

    await storeSummary({
      orgId: 7,
      datasetId: 9,
      content: '- bullet 1\n- bullet 2',
      metadata: { promptVersion: 'v1-digest' },
      promptVersion: 'v1-digest',
      audience: 'digest-weekly',
      weekStart,
    });

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        audience: 'digest-weekly',
        weekStart,
      }),
    );
  });

  it('honors isSeed=true for seed-generated rows', async () => {
    mockReturning.mockResolvedValueOnce([{ id: 3 }]);

    await storeSummary({
      orgId: 7,
      datasetId: 9,
      content: 'seed summary',
      metadata: {},
      promptVersion: 'v1.6',
      isSeed: true,
    });

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ isSeed: true, audience: 'dashboard' }),
    );
  });

  it('routes through a custom client when one is supplied', async () => {
    const txReturning = vi.fn().mockResolvedValueOnce([{ id: 4 }]);
    const txValues = vi.fn(() => ({ returning: txReturning }));
    const tx = { insert: vi.fn(() => ({ values: txValues })) } as never;

    await storeSummary({
      orgId: 7,
      datasetId: 9,
      content: 'tx write',
      metadata: {},
      promptVersion: 'v1.6',
      client: tx,
    });

    expect(txValues).toHaveBeenCalled();
    expect(mockInsertValues).not.toHaveBeenCalled();
  });
});

describe('seed-summary cache regression (AC #14j)', () => {
  // Pre-migration rows did not carry an `audience` column. After the migration
  // backfills DEFAULT 'dashboard', the existing dashboard cache lookup must
  // still find them, without the new audience filter silently breaking demo mode.
  it('finds seed-flagged dashboard rows via getCachedSummary', async () => {
    const seedRow = {
      id: 99,
      orgId: 1,
      datasetId: 1,
      content: 'seed AI summary content',
      audience: 'dashboard', // backfilled by migration DEFAULT
      isSeed: true,
      staleAt: null,
    };
    mockFindFirst.mockResolvedValueOnce(seedRow);

    const result = await getCachedSummary(1, 1);

    expect(result).toEqual(seedRow);
  });
});
