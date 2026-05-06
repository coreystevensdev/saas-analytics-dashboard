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

// markSent assumes the row exists, the per-send handler always calls
// upsertDefaults first (so the row is guaranteed before mark-time). Kept as a
// plain UPDATE because the digest pipeline's invariant is "preferences row
// exists before we send"; if it doesn't, that's a real bug and a silent
// no-op would hide it. setCadence and markUnsubscribed take the opposite
// posture (upsert) because their callers come from settings UI and email
// links, where the row may not exist yet.
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
  const now = new Date();
  await client
    .insert(digestPreferences)
    .values({ userId, cadence })
    .onConflictDoUpdate({
      target: digestPreferences.userId,
      set: { cadence, updatedAt: now },
    });
}

export async function markUnsubscribed(
  userId: number,
  client: typeof db | DbTransaction,
) {
  const now = new Date();
  await client
    .insert(digestPreferences)
    .values({ userId, cadence: 'off', unsubscribedAt: now })
    .onConflictDoUpdate({
      target: digestPreferences.userId,
      set: { cadence: 'off', unsubscribedAt: now, updatedAt: now },
    });
}
