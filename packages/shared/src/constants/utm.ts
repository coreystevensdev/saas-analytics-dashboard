// UTM params attached to every dashboard link clicked from a weekly digest
// email. Centralized so the digest template, future digest variants, and
// analytics filters all see the same source/medium/campaign tuple.
export const DIGEST_UTM_PARAMS = {
  utm_source: 'digest',
  utm_medium: 'email',
  utm_campaign: 'weekly-digest',
} as const;
