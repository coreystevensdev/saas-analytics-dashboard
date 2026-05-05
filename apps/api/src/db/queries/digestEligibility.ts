import { sql, and, eq, lt, isNotNull, gte, exists, or, isNull, ne, desc } from 'drizzle-orm';

import { dbAdmin } from '../../lib/db.js';
import { orgs, subscriptions, datasets, userOrgs, digestPreferences } from '../schema.js';

export interface EligibleOrg {
  id: number;
  name: string;
  activeDatasetId: number;
  businessProfile: unknown;
}

const RECENT_DATASET_INTERVAL = sql`now() - interval '30 days'`;

/**
 * Single-query enumeration of orgs that should receive a weekly digest.
 *
 * Eligibility rules (Story 9.2 AC #2):
 *   - subscription.status='active' AND subscription.plan='pro'
 *   - org has an activeDataset that was created within the last 30 days
 *   - at least one org member has digest_preferences.cadence != 'off' (NULL
 *     defaults to 'weekly', so a user with no row counts as opted-in)
 *
 * Pagination is keyset on orgs.id DESC. Pass `cursor=undefined` for the first
 * page; pass the smallest id from the previous page as `cursor` for the next.
 *
 * Bypasses RLS via dbAdmin, this is a platform operation, not a user request.
 */
export async function findEligibleOrgs(
  cursor?: number,
  pageSize = 500,
): Promise<EligibleOrg[]> {
  const memberOptedIn = exists(
    dbAdmin
      .select({ x: sql`1` })
      .from(userOrgs)
      .leftJoin(digestPreferences, eq(digestPreferences.userId, userOrgs.userId))
      .where(
        and(
          eq(userOrgs.orgId, orgs.id),
          or(isNull(digestPreferences.cadence), ne(digestPreferences.cadence, 'off')),
        ),
      ),
  );

  const conditions = [
    eq(subscriptions.status, 'active'),
    eq(subscriptions.plan, 'pro'),
    isNotNull(orgs.activeDatasetId),
    gte(datasets.createdAt, RECENT_DATASET_INTERVAL),
    memberOptedIn,
  ];

  if (cursor !== undefined) conditions.push(lt(orgs.id, cursor));

  const rows = await dbAdmin
    .select({
      id: orgs.id,
      name: orgs.name,
      activeDatasetId: orgs.activeDatasetId,
      businessProfile: orgs.businessProfile,
    })
    .from(orgs)
    .innerJoin(subscriptions, eq(subscriptions.orgId, orgs.id))
    .innerJoin(datasets, eq(datasets.id, orgs.activeDatasetId))
    .where(and(...conditions))
    .orderBy(desc(orgs.id))
    .limit(pageSize);

  // activeDatasetId is non-null per the WHERE clause; narrow the type.
  return rows.filter((r): r is EligibleOrg => r.activeDatasetId !== null);
}
