import { Router, type Response } from 'express';
import { z } from 'zod';
import { orgFinancialsSchema } from 'shared/schemas';
import { ANALYTICS_EVENTS } from 'shared/constants';

import { requireUser } from '../lib/requireUser.js';
import { withRlsContext } from '../lib/rls.js';
import { orgFinancialsQueries } from '../db/queries/index.js';
import { roleGuard } from '../middleware/roleGuard.js';
import { logger } from '../lib/logger.js';
import { trackEvent } from '../services/analytics/trackEvent.js';

export const orgFinancialsRouter = Router();

const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(60).optional(),
});

orgFinancialsRouter.get('/financials', async (req, res: Response) => {
  const user = requireUser(req);
  const financials = await withRlsContext(user.org_id, user.isAdmin, (tx) =>
    orgFinancialsQueries.getOrgFinancials(user.org_id, tx),
  );
  res.json({ data: financials ?? {} });
});

orgFinancialsRouter.put('/financials', roleGuard('owner'), async (req, res: Response) => {
  const user = requireUser(req);
  const parsed = orgFinancialsSchema.partial().safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid financial baseline',
        details: parsed.error.flatten(),
      },
    });
    return;
  }

  // Default cashAsOfDate to "now" when cashOnHand is set without an explicit date —
  // owners shouldn't have to type today's date every time they update their balance.
  const updates = { ...parsed.data };
  if (updates.cashOnHand != null && !updates.cashAsOfDate) {
    updates.cashAsOfDate = new Date().toISOString();
  }

  const before = await withRlsContext(user.org_id, user.isAdmin, (tx) =>
    orgFinancialsQueries.getOrgFinancials(user.org_id, tx),
  );
  const updated = await withRlsContext(user.org_id, user.isAdmin, (tx) =>
    orgFinancialsQueries.updateOrgFinancials(user.org_id, updates, tx),
  );

  const fieldsUpdated = Object.keys(updates);
  const firstCashBalance = updates.cashOnHand != null && before?.cashOnHand == null;

  trackEvent(user.org_id, Number(user.sub), ANALYTICS_EVENTS.FINANCIALS_UPDATED, {
    fields: fieldsUpdated,
  });

  // Adoption signal — the moment an owner sets their first cash balance is when
  // runway becomes reachable for their account. Tracked separately from the
  // generic update event for cleaner funnel queries.
  if (firstCashBalance) {
    trackEvent(user.org_id, Number(user.sub), ANALYTICS_EVENTS.RUNWAY_ENABLED, {
      cashOnHand: updates.cashOnHand,
    });
  }

  logger.info({ orgId: user.org_id, fieldsUpdated, firstCashBalance }, 'Financials updated');

  res.json({ data: updated ?? {} });
});

orgFinancialsRouter.get('/financials/cash-history', async (req, res: Response) => {
  const user = requireUser(req);
  const q = historyQuerySchema.safeParse(req.query);

  if (!q.success) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid limit parameter' },
    });
    return;
  }

  const history = await withRlsContext(user.org_id, user.isAdmin, (tx) =>
    orgFinancialsQueries.getCashBalanceHistory(user.org_id, q.data.limit ?? 12, tx),
  );

  res.json({ data: history });
});
