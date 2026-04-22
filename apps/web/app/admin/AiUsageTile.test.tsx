import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AiUsageTile } from './AiUsageTile';

describe('AiUsageTile', () => {
  it('renders the estimated cost in USD with two decimals', () => {
    render(
      <AiUsageTile
        usage={{
          inputTokens: 500_000,
          outputTokens: 150_000,
          requestCount: 40,
          estimatedCostUsd: 3.75,
        }}
      />,
    );
    expect(screen.getByText('$3.75')).toBeInTheDocument();
  });

  it('shows compact token counts + request count in the subtitle', () => {
    render(
      <AiUsageTile
        usage={{
          inputTokens: 1_234_000,
          outputTokens: 87_500,
          requestCount: 42,
          estimatedCostUsd: 5.02,
        }}
      />,
    );
    expect(screen.getByText(/42 requests/)).toBeInTheDocument();
    // Intl compact notation: 1.2M, 87.5K
    expect(screen.getByText(/1\.2M in/)).toBeInTheDocument();
    expect(screen.getByText(/87\.5K out/)).toBeInTheDocument();
  });

  it('pluralizes "request" correctly for a single request', () => {
    render(
      <AiUsageTile
        usage={{ inputTokens: 100, outputTokens: 50, requestCount: 1, estimatedCostUsd: 0.01 }}
      />,
    );
    expect(screen.getByText(/1 request /)).toBeInTheDocument();
    expect(screen.queryByText(/1 requests/)).not.toBeInTheDocument();
  });

  it('renders $0.00 cleanly for a zero-usage month', () => {
    render(
      <AiUsageTile
        usage={{ inputTokens: 0, outputTokens: 0, requestCount: 0, estimatedCostUsd: 0 }}
      />,
    );
    expect(screen.getByText('$0.00')).toBeInTheDocument();
    expect(screen.getByText(/0 requests/)).toBeInTheDocument();
  });
});
