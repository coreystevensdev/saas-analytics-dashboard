'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Link2, Link2Off, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface QbStatus {
  connected: boolean;
  companyName?: string;
  syncStatus?: 'idle' | 'syncing' | 'error';
  lastSyncedAt?: string;
}

type View = 'loading' | 'disconnected' | 'connected' | 'unavailable';

export function QuickBooksCard() {
  const [view, setView] = useState<View>('loading');
  const [status, setStatus] = useState<QbStatus | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient<QbStatus>('/integrations/quickbooks/status');
        if (cancelled) return;
        setStatus(res.data);
        setView(res.data.connected ? 'connected' : 'disconnected');
      } catch {
        // 501 INTEGRATION_NOT_CONFIGURED or any fetch failure — hide the card entirely.
        // Keeps a broken backend from clutter-ing the CSV-first experience.
        if (cancelled) return;
        setView('unavailable');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleConnect = useCallback(async () => {
    setConnecting(true);
    try {
      const res = await apiClient<{ authUrl: string }>('/integrations/quickbooks/connect', {
        method: 'POST',
      });
      window.location.href = res.data.authUrl;
    } catch {
      setConnecting(false);
    }
  }, []);

  if (view === 'unavailable') return null;

  if (view === 'loading') {
    return (
      <div
        role="status"
        aria-label="Loading QuickBooks integration"
        className="flex min-h-[240px] items-center justify-center rounded-lg border border-dashed border-border p-8"
      >
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (view === 'connected' && status) {
    const last = status.lastSyncedAt ? new Date(status.lastSyncedAt) : null;
    return (
      <section
        aria-label="QuickBooks connection"
        className="flex min-h-[240px] flex-col rounded-lg border border-border bg-card p-6"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
            <Link2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">QuickBooks connected</h2>
            <p className="text-xs text-muted-foreground">{status.companyName ?? 'Your company'}</p>
          </div>
        </div>

        <dl className="mt-5 space-y-2 text-xs text-muted-foreground">
          <div className="flex justify-between">
            <dt>Status</dt>
            <dd className="font-medium text-foreground">{status.syncStatus ?? 'idle'}</dd>
          </div>
          {last && (
            <div className="flex justify-between">
              <dt>Last synced</dt>
              <dd className="text-foreground">
                {last.toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-auto pt-5">
          <Link
            href="/settings/integrations"
            className="inline-block text-sm font-medium text-primary underline underline-offset-4 hover:text-primary/80"
          >
            Manage in Settings
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Connect QuickBooks"
      className="flex min-h-[240px] flex-col rounded-lg border border-border bg-card p-6"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
          <Link2Off className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Import from QuickBooks</h2>
          <p className="text-xs text-muted-foreground">
            Skip the CSV — connect your accounting in two clicks.
          </p>
        </div>
      </div>

      <ul className="mt-5 space-y-1.5 text-xs text-muted-foreground">
        <li>&middot; Daily sync, no re-uploading</li>
        <li>&middot; Income and expenses categorized for you</li>
        <li>&middot; Revoke access anytime from Settings</li>
      </ul>

      <div className="mt-auto pt-5">
        <button
          type="button"
          onClick={handleConnect}
          disabled={connecting}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {connecting ? 'Redirecting to QuickBooks…' : 'Connect QuickBooks'}
        </button>
      </div>
    </section>
  );
}
