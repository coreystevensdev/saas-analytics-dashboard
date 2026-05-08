import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { AUTH } from 'shared/constants';
import type { EmailPreferencesResponse } from 'shared/schemas';
import { apiServer } from '@/lib/api-server';
import EmailSettings from './EmailSettings';

export const metadata: Metadata = {
  title: 'Email, Tellsight',
};

const DEFAULTS: EmailPreferencesResponse = {
  cadence: 'weekly',
  timezone: 'UTC',
  unsubscribedAt: null,
  lastSentAt: null,
};

export default async function EmailSettingsPage() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(AUTH.COOKIE_NAMES.ACCESS_TOKEN)?.value;

  if (!accessToken) {
    redirect('/login?next=/settings/email');
  }

  let initial: EmailPreferencesResponse = DEFAULTS;
  try {
    const res = await apiServer<EmailPreferencesResponse>('/preferences/email/digest', {
      cookies: cookieStore.toString(),
    });
    initial = res.data;
  } catch {
    // Fall through to defaults; the client form can still submit a fresh row.
  }

  return <EmailSettings initial={initial} />;
}
