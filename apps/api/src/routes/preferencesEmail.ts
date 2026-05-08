import { Router, type Response } from 'express';
import { ANALYTICS_EVENTS } from 'shared/constants';
import { updateEmailPreferencesSchema } from 'shared/schemas';

import { requireUser } from '../lib/requireUser.js';
import { withUserRlsContext } from '../lib/rls.js';
import { digestPreferencesQueries } from '../db/queries/index.js';
import { logger } from '../lib/logger.js';
import { trackEvent } from '../services/analytics/trackEvent.js';
import { ValidationError } from '../lib/appError.js';

export const preferencesEmailRouter = Router();

const DEFAULT_CADENCE = 'weekly' as const;
const DEFAULT_TIMEZONE = 'UTC' as const;

preferencesEmailRouter.get('/digest', async (req, res: Response) => {
  const user = requireUser(req);
  const userId = Number(user.sub);

  const prefs = await withUserRlsContext(userId, user.isAdmin, async (tx) =>
    digestPreferencesQueries.getByUserId(userId, tx),
  );

  if (!prefs) {
    res.json({
      data: {
        cadence: DEFAULT_CADENCE,
        timezone: DEFAULT_TIMEZONE,
        unsubscribedAt: null,
        lastSentAt: null,
      },
    });
    return;
  }

  res.json({
    data: {
      cadence: prefs.cadence,
      timezone: prefs.timezone,
      unsubscribedAt: prefs.unsubscribedAt?.toISOString() ?? null,
      lastSentAt: prefs.lastSentAt?.toISOString() ?? null,
    },
  });
});

preferencesEmailRouter.put('/digest', async (req, res: Response) => {
  const user = requireUser(req);
  const userId = Number(user.sub);

  const parsed = updateEmailPreferencesSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError('Invalid email preferences payload', parsed.error.issues);
  }

  const { cadence, timezone } = parsed.data;

  await withUserRlsContext(userId, user.isAdmin, async (tx) => {
    await digestPreferencesQueries.setCadence(userId, cadence, tx);
    await digestPreferencesQueries.setTimezone(userId, timezone, tx);
  });

  trackEvent(user.org_id, userId, ANALYTICS_EVENTS.DIGEST_PREFERENCE_CHANGED, {
    cadence,
    timezone,
  });

  logger.info({ userId, orgId: user.org_id, cadence, timezone }, 'Digest preferences updated');
  res.json({ data: { cadence, timezone } });
});
