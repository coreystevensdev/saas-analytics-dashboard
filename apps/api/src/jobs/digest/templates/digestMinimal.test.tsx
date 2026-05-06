import { describe, it, expect, vi } from 'vitest';
import { render } from '@react-email/render';

vi.mock('../../../config.js', () => ({
  env: {
    APP_URL: 'https://app.tellsight.com',
    JWT_SECRET: 'a'.repeat(64),
    EMAIL_MAILING_ADDRESS: '123 Some Real Street, Anywhere, ZZ 00000',
  },
}));

const {
  DigestMinimal,
  parseSummaryToBullets,
  buildDashboardUrl,
  buildUnsubscribeUrl,
} = await import('./digestMinimal.js');

describe('DigestMinimal render', () => {
  it('renders headings, bullets, dashboard link, footer, and disclaimer', async () => {
    const html = await render(
      DigestMinimal({
        orgName: 'Acme Coffee',
        bullets: ['Revenue up 12%', 'Payroll spiked', 'Runway 8 months'],
        dashboardUrl: 'https://app.tellsight.com/dashboard?datasetId=1',
        unsubscribeUrl: 'https://app.tellsight.com/unsubscribe?token=t',
        mailingAddress: '123 Some Real Street, Anywhere, ZZ 00000',
      }),
    );

    expect(html).toContain('Acme Coffee');
    expect(html).toContain('Revenue up 12%');
    expect(html).toContain('Payroll spiked');
    expect(html).toContain('Runway 8 months');
    expect(html).toContain('https://app.tellsight.com/dashboard');
    expect(html).toContain('https://app.tellsight.com/unsubscribe');
    expect(html).toContain('123 Some Real Street');
    expect(html).toMatch(/financial advice/i);
  });

  it('renders an empty state when no bullets are passed', async () => {
    const html = await render(
      DigestMinimal({
        orgName: 'Acme',
        bullets: [],
        dashboardUrl: 'https://x/y',
        unsubscribeUrl: 'https://x/z',
        mailingAddress: '1 Real Way',
      }),
    );

    expect(html).toContain('Acme');
    expect(html).toContain('Unsubscribe');
  });
});

describe('parseSummaryToBullets', () => {
  it('splits leading-dash bullets and trims each', () => {
    const input = '- First insight\n- Second insight\n- Third insight';
    expect(parseSummaryToBullets(input)).toEqual([
      'First insight',
      'Second insight',
      'Third insight',
    ]);
  });

  it('handles asterisk bullets and stray whitespace', () => {
    const input = '\n   - Padded\n\n -  More padding   \n- Final\n\n';
    expect(parseSummaryToBullets(input)).toEqual(['Padded', 'More padding', 'Final']);
  });

  it('caps at 5 bullets', () => {
    const input = Array.from({ length: 10 }, (_, i) => `- Bullet ${i + 1}`).join('\n');
    const bullets = parseSummaryToBullets(input);
    expect(bullets).toHaveLength(5);
    expect(bullets[0]).toBe('Bullet 1');
    expect(bullets[4]).toBe('Bullet 5');
  });

  it('skips empty lines', () => {
    expect(parseSummaryToBullets('- One\n\n\n- Two')).toEqual(['One', 'Two']);
  });
});

describe('buildDashboardUrl', () => {
  it('appends datasetId + UTM params', () => {
    const url = buildDashboardUrl(42);
    expect(url).toContain('datasetId=42');
    expect(url).toContain('utm_source=digest');
    expect(url).toContain('utm_medium=email');
    expect(url).toContain('utm_campaign=weekly-digest');
    expect(url).toContain('https://app.tellsight.com/dashboard');
  });
});

describe('buildUnsubscribeUrl', () => {
  it('produces a verifiable token at the existing /unsubscribe/digest/[token] path', async () => {
    const { verifyUnsubscribeToken } = await import('../unsubscribeToken.js');
    const url = buildUnsubscribeUrl(7);
    expect(url).toMatch(/\/unsubscribe\/digest\//);

    const segments = new URL(url).pathname.split('/');
    const tokenEncoded = segments[segments.length - 1]!;
    const token = decodeURIComponent(tokenEncoded);
    expect(verifyUnsubscribeToken(token)).toEqual({ userId: 7 });
  });
});
