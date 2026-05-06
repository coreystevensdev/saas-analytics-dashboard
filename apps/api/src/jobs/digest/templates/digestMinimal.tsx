// Replaced by Story 9.3's React Email template. Do not iterate visual design
// here, this is a pass-through to unblock 9.2's end-to-end test.
import { AI_DISCLAIMER, DIGEST_UTM_PARAMS } from 'shared/constants';

import { env } from '../../../config.js';
import { signUnsubscribeToken } from '../unsubscribeToken.js';

export interface DigestMinimalProps {
  orgName: string;
  bullets: string[];
  dashboardUrl: string;
  unsubscribeUrl: string;
  mailingAddress: string;
}

const styles = {
  body: { margin: 0, padding: 0, fontFamily: 'Arial, sans-serif', backgroundColor: '#f6f7f9' },
  container: { maxWidth: 580, margin: '0 auto', padding: '24px 16px' },
  card: { background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 6, padding: 24 },
  heading: { fontSize: 18, color: '#111827', marginTop: 0, marginBottom: 16 },
  bullet: { fontSize: 14, color: '#1f2937', lineHeight: 1.6, marginTop: 0, marginBottom: 12 },
  link: { color: '#2563eb', textDecoration: 'none', fontSize: 14 },
  disclaimer: { color: '#6b7280', fontSize: 11, marginTop: 24, lineHeight: 1.4 },
  footer: { color: '#9ca3af', fontSize: 11, marginTop: 16, textAlign: 'center' as const, lineHeight: 1.5 },
};

export function DigestMinimal({
  orgName,
  bullets,
  dashboardUrl,
  unsubscribeUrl,
  mailingAddress,
}: DigestMinimalProps) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>{`${orgName} weekly insights`}</title>
      </head>
      <body style={styles.body}>
        <div style={styles.container}>
          <div style={styles.card}>
            <h1 style={styles.heading}>{`${orgName} weekly insights`}</h1>
            {bullets.map((b, i) => (
              <p key={i} style={styles.bullet}>{b}</p>
            ))}
            <p>
              <a href={dashboardUrl} style={styles.link}>
                See full dashboard →
              </a>
            </p>
            <p style={styles.disclaimer}>{AI_DISCLAIMER}</p>
          </div>
          <p style={styles.footer}>
            {mailingAddress}
            <br />
            <a href={unsubscribeUrl} style={{ color: '#9ca3af', textDecoration: 'underline' }}>
              Unsubscribe from these emails
            </a>
          </p>
        </div>
      </body>
    </html>
  );
}

/** Splits the v1-digest output into trimmed bullet strings. Defensive: max 5
 *  bullets, each trimmed of leading dashes/whitespace, empty lines skipped. */
export function parseSummaryToBullets(content: string): string[] {
  return content
    .split('\n')
    .map((line) => line.replace(/^[\s-]+/, '').trim())
    .filter((line) => line.length > 0)
    .slice(0, 5);
}

export function buildDashboardUrl(datasetId: number): string {
  const url = new URL('/dashboard', env.APP_URL);
  url.searchParams.set('datasetId', String(datasetId));
  for (const [key, value] of Object.entries(DIGEST_UTM_PARAMS)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

export function buildUnsubscribeUrl(userId: number): string {
  // Path scheme matches the existing Next.js page at /unsubscribe/digest/[token].
  // Story 9.4 may reshape, but for 9.2 the frontend expects this exact path.
  const token = signUnsubscribeToken(userId);
  return new URL(`/unsubscribe/digest/${encodeURIComponent(token)}`, env.APP_URL).toString();
}
