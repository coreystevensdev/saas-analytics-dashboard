import { describe, it, expect, vi, beforeEach } from 'vitest';

// Main eligibility query chain
const mockLimit = vi.fn<(n: number) => Promise<unknown[]>>();
const mockOrderBy = vi.fn((..._args: unknown[]) => ({ limit: mockLimit }));
const mockWhere = vi.fn((..._args: unknown[]) => ({ orderBy: mockOrderBy }));
const mockInnerJoinDatasets = vi.fn((..._args: unknown[]) => ({ where: mockWhere }));
const mockInnerJoinSubs = vi.fn((..._args: unknown[]) => ({ innerJoin: mockInnerJoinDatasets }));
const mockFromOrgs = vi.fn((..._args: unknown[]) => ({ innerJoin: mockInnerJoinSubs }));
const mockSelect = vi.fn((..._args: unknown[]) => ({ from: mockFromOrgs }));

// findOrgRecipients chain (INNER users + LEFT digest_preferences)
const mockRecipientsWhere = vi.fn<(...args: unknown[]) => Promise<unknown[]>>();
const mockRecipientsLeftJoin = vi.fn((..._args: unknown[]) => ({ where: mockRecipientsWhere }));
const mockRecipientsInnerJoin = vi.fn((..._args: unknown[]) => ({ leftJoin: mockRecipientsLeftJoin }));
const mockRecipientsFrom = vi.fn((..._args: unknown[]) => ({ innerJoin: mockRecipientsInnerJoin }));

// exists() subquery chain
const mockExistsLeftJoin = vi.fn((..._args: unknown[]) => ({ where: vi.fn() }));
const mockExistsFrom = vi.fn((..._args: unknown[]) => ({ leftJoin: mockExistsLeftJoin }));
const mockExistsSelect = vi.fn((..._args: unknown[]) => ({ from: mockExistsFrom }));

vi.mock('../../lib/db.js', () => ({
  dbAdmin: {
    select: (arg?: unknown) => {
      // Three select shapes: main eligibility, recipients, and exists() subquery.
      // Subquery: single { x: <sql> } projection.
      if (
        arg &&
        typeof arg === 'object' &&
        Object.keys(arg as Record<string, unknown>).length === 1 &&
        'x' in (arg as Record<string, unknown>)
      ) {
        mockExistsSelect(arg);
        return { from: mockExistsFrom };
      }
      // Recipients: { userId, email, name } projection.
      if (
        arg &&
        typeof arg === 'object' &&
        'userId' in (arg as Record<string, unknown>) &&
        'email' in (arg as Record<string, unknown>)
      ) {
        return { from: mockRecipientsFrom };
      }
      // Default: main eligibility query.
      mockSelect(arg);
      return { from: mockFromOrgs };
    },
  },
}));

const { findEligibleOrgs, findOrgRecipients } = await import('./digestEligibility.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('findEligibleOrgs', () => {
  it('returns rows shaped as EligibleOrg with non-null activeDatasetId', async () => {
    mockLimit.mockResolvedValueOnce([
      { id: 10, name: 'Acme', activeDatasetId: 100, businessProfile: { businessType: 'agency' } },
      { id: 9, name: 'Beta', activeDatasetId: 200, businessProfile: null },
    ]);

    const rows = await findEligibleOrgs();

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: 10, activeDatasetId: 100 });
    expect(rows[1]).toMatchObject({ id: 9, activeDatasetId: 200 });
  });

  it('filters out rows with null activeDatasetId (defensive narrowing)', async () => {
    mockLimit.mockResolvedValueOnce([
      { id: 10, name: 'Acme', activeDatasetId: 100, businessProfile: null },
      { id: 9, name: 'Beta', activeDatasetId: null, businessProfile: null },
    ]);

    const rows = await findEligibleOrgs();

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(10);
  });

  it('passes the cursor through to the SQL where clause', async () => {
    mockLimit.mockResolvedValueOnce([]);

    await findEligibleOrgs(50, 100);

    expect(mockLimit).toHaveBeenCalledWith(100);
    expect(mockWhere).toHaveBeenCalled();
  });

  it('defaults pageSize to 500', async () => {
    mockLimit.mockResolvedValueOnce([]);

    await findEligibleOrgs();

    expect(mockLimit).toHaveBeenCalledWith(500);
  });

  it('joins through subscriptions and datasets', async () => {
    mockLimit.mockResolvedValueOnce([]);

    await findEligibleOrgs();

    expect(mockInnerJoinSubs).toHaveBeenCalled();
    expect(mockInnerJoinDatasets).toHaveBeenCalled();
  });
});

describe('findOrgRecipients', () => {
  it('returns user rows shaped as DigestRecipient', async () => {
    mockRecipientsWhere.mockResolvedValueOnce([
      { userId: 1, email: 'a@x.com', name: 'Alice' },
      { userId: 2, email: 'b@x.com', name: 'Bob' },
    ]);

    const rows = await findOrgRecipients(42);

    expect(rows).toEqual([
      { userId: 1, email: 'a@x.com', name: 'Alice' },
      { userId: 2, email: 'b@x.com', name: 'Bob' },
    ]);
  });

  it('returns an empty array when no member matches the filters', async () => {
    mockRecipientsWhere.mockResolvedValueOnce([]);

    const rows = await findOrgRecipients(42);

    expect(rows).toEqual([]);
  });

  it('exercises the LEFT JOIN onto digest_preferences (NULL counts as opted-in)', async () => {
    mockRecipientsWhere.mockResolvedValueOnce([]);

    await findOrgRecipients(42);

    expect(mockRecipientsLeftJoin).toHaveBeenCalled();
  });
});
