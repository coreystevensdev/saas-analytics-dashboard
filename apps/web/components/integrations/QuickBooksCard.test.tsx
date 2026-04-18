import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockApiClient = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiClient: (...args: unknown[]) => mockApiClient(...args),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import { QuickBooksCard } from './QuickBooksCard';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('QuickBooksCard', () => {
  it('renders disconnected state with Connect button and value props', async () => {
    mockApiClient.mockResolvedValueOnce({ data: { connected: false } });

    render(<QuickBooksCard />);

    await waitFor(() => {
      expect(screen.getByText('Import from QuickBooks')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /connect quickbooks/i })).toBeInTheDocument();
    expect(screen.getByText(/daily sync/i)).toBeInTheDocument();
  });

  it('renders connected state with company name and Manage link', async () => {
    mockApiClient.mockResolvedValueOnce({
      data: {
        connected: true,
        companyName: 'Acme Coffee Co',
        syncStatus: 'idle',
        lastSyncedAt: '2026-04-17T14:30:00.000Z',
      },
    });

    render(<QuickBooksCard />);

    await waitFor(() => {
      expect(screen.getByText('QuickBooks connected')).toBeInTheDocument();
    });
    expect(screen.getByText('Acme Coffee Co')).toBeInTheDocument();
    expect(screen.getByText('idle')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /manage in settings/i })).toHaveAttribute(
      'href',
      '/settings/integrations',
    );
  });

  it('renders nothing when status endpoint throws (QB not configured)', async () => {
    mockApiClient.mockRejectedValueOnce(new Error('QuickBooks integration is not configured'));

    const { container } = render(<QuickBooksCard />);

    await waitFor(() => {
      expect(container).toBeEmptyDOMElement();
    });
  });

  it('calls connect endpoint and redirects to authUrl on click', async () => {
    mockApiClient
      .mockResolvedValueOnce({ data: { connected: false } })
      .mockResolvedValueOnce({ data: { authUrl: 'https://oauth.intuit.test/auth?state=abc' } });

    const originalLocation = window.location;
    const hrefSetter = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        assign: vi.fn(),
        set href(url: string) {
          hrefSetter(url);
        },
      },
    });

    render(<QuickBooksCard />);

    const button = await screen.findByRole('button', { name: /connect quickbooks/i });
    await userEvent.click(button);

    await waitFor(() => {
      expect(mockApiClient).toHaveBeenCalledWith('/integrations/quickbooks/connect', {
        method: 'POST',
      });
    });
    expect(hrefSetter).toHaveBeenCalledWith('https://oauth.intuit.test/auth?state=abc');

    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  it('re-enables Connect button when connect endpoint fails', async () => {
    mockApiClient
      .mockResolvedValueOnce({ data: { connected: false } })
      .mockRejectedValueOnce(new Error('Network error'));

    render(<QuickBooksCard />);

    const button = await screen.findByRole('button', { name: /connect quickbooks/i });
    await userEvent.click(button);

    await waitFor(() => {
      expect(button).not.toBeDisabled();
    });
    expect(button).toHaveTextContent(/connect quickbooks/i);
  });

  it('omits Last synced row when lastSyncedAt is missing', async () => {
    mockApiClient.mockResolvedValueOnce({
      data: { connected: true, companyName: 'New Co', syncStatus: 'idle' },
    });

    render(<QuickBooksCard />);

    await waitFor(() => {
      expect(screen.getByText('QuickBooks connected')).toBeInTheDocument();
    });
    expect(screen.queryByText('Last synced')).not.toBeInTheDocument();
  });
});
