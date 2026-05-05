import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindFirst = vi.fn();
const mockReturning = vi.fn();
const mockOnConflictDoNothing = vi.fn(() => ({ returning: mockReturning }));
const mockInsertValues = vi.fn(() => ({
  onConflictDoNothing: mockOnConflictDoNothing,
  returning: mockReturning,
}));
const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }));
const mockInsert = vi.fn(() => ({ values: mockInsertValues }));
const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }));

vi.mock('../../lib/db.js', () => ({
  db: {
    query: { digestPreferences: { findFirst: mockFindFirst } },
    insert: mockInsert,
    update: mockUpdate,
  },
}));

const { db } = await import('../../lib/db.js');
const {
  getByUserId,
  upsertDefaults,
  markSent,
  setCadence,
  markUnsubscribed,
} = await import('./digestPreferences.js');

beforeEach(() => {
  // Reset only leaf mocks. Chain mocks must keep their factory impls.
  mockFindFirst.mockReset();
  mockReturning.mockReset();
  mockUpdateWhere.mockReset().mockResolvedValue(undefined);
});

describe('getByUserId', () => {
  it('returns the row when present', async () => {
    const row = { userId: 7, cadence: 'weekly' };
    mockFindFirst.mockResolvedValueOnce(row);

    const result = await getByUserId(7);

    expect(result).toEqual(row);
    expect(mockFindFirst).toHaveBeenCalledOnce();
  });

  it('returns undefined when missing', async () => {
    mockFindFirst.mockResolvedValueOnce(undefined);

    const result = await getByUserId(99);

    expect(result).toBeUndefined();
  });
});

describe('upsertDefaults', () => {
  it('returns the inserted row when no conflict', async () => {
    const inserted = { userId: 7, cadence: 'weekly', timezone: 'UTC' };
    mockReturning.mockResolvedValueOnce([inserted]);

    const result = await upsertDefaults(7, db);

    expect(result).toEqual(inserted);
    expect(mockInsertValues).toHaveBeenCalledWith({ userId: 7 });
  });

  it('falls back to a read when insert conflicts', async () => {
    mockReturning.mockResolvedValueOnce([]);
    const existing = { userId: 7, cadence: 'monthly' };
    mockFindFirst.mockResolvedValueOnce(existing);

    const result = await upsertDefaults(7, db);

    expect(result).toEqual(existing);
  });

  it('throws if conflict + read both miss (should never happen)', async () => {
    mockReturning.mockResolvedValueOnce([]);
    mockFindFirst.mockResolvedValueOnce(undefined);

    await expect(upsertDefaults(7, db)).rejects.toThrow(/upsertDefaults/);
  });
});

describe('markSent', () => {
  it('updates lastSentAt + updatedAt', async () => {
    const sentAt = new Date('2026-05-03T18:00:00Z');

    await markSent(7, sentAt, db);

    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ lastSentAt: sentAt, updatedAt: expect.any(Date) }),
    );
    expect(mockUpdateWhere).toHaveBeenCalled();
  });
});

describe('setCadence', () => {
  it('writes the cadence string', async () => {
    await setCadence(7, 'monthly', db);

    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ cadence: 'monthly', updatedAt: expect.any(Date) }),
    );
  });
});

describe('markUnsubscribed', () => {
  it('flips cadence to off and stamps unsubscribedAt', async () => {
    await markUnsubscribed(7, db);

    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        cadence: 'off',
        unsubscribedAt: expect.any(Date),
        updatedAt: expect.any(Date),
      }),
    );
  });
});
