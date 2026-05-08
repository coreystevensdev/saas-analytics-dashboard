import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCookiesGet = vi.fn();
const mockCookiesToString = vi.fn();
const mockRedirect = vi.fn();
const mockApiServer = vi.fn();

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => mockCookiesGet(name),
    toString: () => mockCookiesToString(),
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    mockRedirect(url);
    throw new Error('NEXT_REDIRECT');
  },
}));

vi.mock('@/lib/api-server', () => ({
  apiServer: (...args: unknown[]) => mockApiServer(...args),
}));

vi.mock('./EmailSettings', () => ({
  default: () => null,
}));

const { default: EmailSettingsPage } = await import('./page');

interface RscNode {
  props: { initial: { cadence: string; timezone: string } };
}

beforeEach(() => {
  mockCookiesGet.mockReset();
  mockCookiesToString.mockReset();
  mockRedirect.mockReset();
  mockApiServer.mockReset();
});

describe('EmailSettingsPage (RSC)', () => {
  it('redirects to /login?next=/settings/email when access-token cookie is missing', async () => {
    mockCookiesGet.mockReturnValueOnce(undefined);

    await expect(EmailSettingsPage()).rejects.toThrow('NEXT_REDIRECT');

    expect(mockRedirect).toHaveBeenCalledWith('/login?next=/settings/email');
    expect(mockApiServer).not.toHaveBeenCalled();
  });

  it('renders with server-fetched preferences when cookie is present', async () => {
    mockCookiesGet.mockReturnValueOnce({ value: 'jwt-abc' });
    mockCookiesToString.mockReturnValueOnce('access_token=jwt-abc');
    mockApiServer.mockResolvedValueOnce({
      data: { cadence: 'monthly', timezone: 'America/Los_Angeles', unsubscribedAt: null, lastSentAt: null },
    });

    const tree = (await EmailSettingsPage()) as unknown as RscNode;

    expect(mockApiServer).toHaveBeenCalledWith(
      '/preferences/email/digest',
      expect.objectContaining({ cookies: 'access_token=jwt-abc' }),
    );
    expect(tree.props.initial).toMatchObject({ cadence: 'monthly', timezone: 'America/Los_Angeles' });
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('falls through to defaults when the upstream fetch throws', async () => {
    mockCookiesGet.mockReturnValueOnce({ value: 'jwt-abc' });
    mockCookiesToString.mockReturnValueOnce('access_token=jwt-abc');
    mockApiServer.mockRejectedValueOnce(new Error('upstream 502'));

    const tree = (await EmailSettingsPage()) as unknown as RscNode;

    expect(tree.props.initial).toMatchObject({ cadence: 'weekly', timezone: 'UTC' });
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
