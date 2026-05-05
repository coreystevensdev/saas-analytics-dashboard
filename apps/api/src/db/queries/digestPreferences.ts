import { eq } from 'drizzle-orm';

import { db, type DbTransaction } from '../../lib/db.js';
import { digestPreferences } from '../schema.js';

export type DigestCadence = 'weekly' | 'monthly' | 'off';

// Mutations require an explicit `client` to force callers to pick the right
// RLS posture. User-facing routes pass `db` (RLS scoped via SET LOCAL
// app.current_user_id). Worker handlers pass `dbAdmin` to bypass RLS, workers
// run outside any user session, so the admin policy is the correct path.

export async function getByUserId(
  userId: number,
  client: typeof db | DbTransaction = db,
) {
  return client.query.digestPreferences.findFirst({
    where: eq(digestPreferences.userId, userId),
  });
}

/** Inserts default preferences if no row exists. Idempotent, safe to call
 *  on every digest send attempt. */
export async function upsertDefaults(
  userId: number,
  client: typeof db | DbTransaction,
) {
  const [row] = await client
    .insert(digestPreferences)
    .values({ userId })
    .onConflictDoNothing({ target: digestPreferences.userId })
    .returning();

  if (row) return row;

  const existing = await getByUserId(userId, client);
  if (!existing) throw new Error(`upsertDefaults: row missing after conflict for userId=${userId}`);
  return existing;
}

export async function markSent(
  userId: number,
  sentAt: Date,
  client: typeof db | DbTransaction,
) {
  await client
    .update(digestPreferences)
    .set({ lastSentAt: sentAt, updatedAt: new Date() })
    .where(eq(digestPreferences.userId, userId));
}

export async function setCadence(
  userId: number,
  cadence: DigestCadence,
  client: typeof db | DbTransaction,
) {
  await client
    .update(digestPreferences)
    .set({ cadence, updatedAt: new Date() })
    .where(eq(digestPreferences.userId, userId));
}

export async function markUnsubscribed(
  userId: number,
  client: typeof db | DbTransaction,
) {
  const now = new Date();
  await client
    .update(digestPreferences)
    .set({ cadence: 'off', unsubscribedAt: now, updatedAt: now })
    .where(eq(digestPreferences.userId, userId));
}
