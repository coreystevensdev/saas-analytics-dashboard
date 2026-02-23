# SystemHealthPanel.tsx — Interview-Ready Documentation

## Elevator Pitch

A self-contained health monitoring panel that polls the API every 30 seconds and shows the status of the database, Redis, and Claude API. It handles loading (skeleton rows), success (colored status dots with latency), stale data (warning banner when refresh fails), and total failure (fallback message) — all in one component.

## Why This Approach

Unlike the other admin tables that receive data as props from a server component, this panel owns its own data fetching via SWR. That's because health data is inherently dynamic — it needs periodic refresh without full page reloads. SWR gives you `refreshInterval` for polling, automatic deduplication, and stale-while-revalidate semantics out of the box.

The alternative (server component with revalidation) would require either ISR with a short `revalidate` interval or a client-side `setInterval` + `fetch`. SWR is purpose-built for this pattern and handles edge cases (tab focus, error recovery, race conditions) that a manual implementation would miss.

## Code Walkthrough

**Static lookup tables**: Three `Record` objects at the top map service keys to display labels, status strings to CSS color classes, and status strings to human-readable labels. Using records instead of switch statements or if-chains keeps the rendering logic clean.

**`fetcher(url)`**: A thin fetch wrapper that includes credentials (for the auth cookie), checks `res.ok`, and extracts the `data` field from the API's standard response envelope. This follows the project's BFF pattern — the browser calls `/api/admin/health` on the Next.js server, which proxies to Express on port 3001.

**`StatusDot`**: A tiny component that renders a colored circle. The `aria-hidden="true"` is correct here because the parent `<span>` has its own `aria-label` with the full status text. The dot is purely decorative.

**`SkeletonRows`**: Three placeholder rows shown during initial load. Each row mimics the three-column layout (service name, status, latency) with pulsing gray bars of appropriate widths.

**`SystemHealthPanel`** (the main export): Uses SWR with two key options:
- `refreshInterval: 30_000` — polls every 30 seconds.
- `revalidateOnFocus: false` — prevents a burst of requests when you alt-tab back.

The rendering logic handles four states:
1. **Loading, no data yet**: Show `SkeletonRows`.
2. **Data available**: Render service rows with status dots and latency.
3. **Error but stale data exists**: Show a yellow warning + the last known data. This is SWR's stale-while-revalidate in action.
4. **Error and no data**: Show the "Unable to load" fallback.

The `aria-live="polite"` on the Card means screen readers announce status changes without interrupting the user. The `role="status"` reinforces this.

## Complexity & Trade-offs

**Gained**: Real-time-ish health monitoring with graceful degradation. The stale data behavior is particularly valuable — if the health endpoint itself is down, you still see the last known state instead of a blank panel.

**Sacrificed**: The 30-second polling interval means status changes can take up to 30 seconds to appear. For an admin dashboard that's glanced at occasionally, this latency is acceptable. If you needed instant updates, you'd use WebSockets or Server-Sent Events.

**No historical data**: This shows current status only. Adding a health history chart would require storing health check results in the database and a separate query.

**Service list is static**: `SERVICE_LABELS` hardcodes three services. Adding a new service requires a code change. You could make this dynamic (iterate whatever the API returns), but explicit labels are safer — you control the display order and names.

## Patterns Worth Knowing

- **SWR polling**: `refreshInterval` turns SWR into a poller. Combined with `stale-while-revalidate`, you get automatic background updates with no loading flicker on subsequent fetches.
- **Stale-while-revalidate**: When a refresh fails, SWR keeps serving the last successful response. The component detects this (`error && hasData`) and shows a warning. Users see outdated but real data instead of nothing.
- **Status dot pattern**: A colored circle (green/yellow/red) is a universal status indicator. Combining it with a text label and `aria-label` makes it accessible.
- **Skeleton loading**: Rendering placeholder shapes that match the real content layout prevents layout shift and communicates structure.

## Interview Questions

**Q: Why use SWR instead of React Query or a manual setInterval?**
A: SWR and React Query solve the same problem — SWR is lighter and already in the project's dependency tree. The key advantage over `setInterval` + `useState`: SWR handles deduplication (multiple components calling the same endpoint share one request), tab visibility (pauses polling when the tab is hidden), and stale data management. A manual implementation would need to handle all of these.

**Q: What happens when the health endpoint returns an error?**
A: SWR sets `error` but keeps `data` from the last successful fetch. The component detects this combination and shows a yellow warning ("Unable to refresh — showing last known status") while still displaying the stale data. If there was never a successful fetch, it shows the fallback message.

**Q: Why is `revalidateOnFocus` set to false?**
A: The panel already polls every 30 seconds. Without this flag, SWR would also re-fetch every time the browser tab regains focus. For a health panel, that creates unnecessary request bursts when an admin is alt-tabbing between tools. The polling interval is sufficient.

**Q: How would you handle a service that the API returns but isn't in SERVICE_LABELS?**
A: The `SERVICE_LABELS[key] ?? key` fallback handles this — unknown services display their raw key as the label. It's not pretty, but it won't crash. A more robust approach would be to have the API return display names alongside status.

**Q: Why `aria-live="polite"` instead of `"assertive"`?**
A: `"polite"` waits until the screen reader finishes its current announcement before reading the update. `"assertive"` interrupts immediately. For background status updates every 30 seconds, you don't want to interrupt whatever the admin is currently doing. Save `"assertive"` for critical alerts.

## Data Structures

```
SystemHealth {
  services: Record<string, ServiceStatus>    // keyed by service name
  uptime: { seconds: number, formatted: string }
}

ServiceStatus {
  status: 'ok' | 'degraded' | 'error'
  latencyMs: number
}
```

The `services` object uses string keys rather than a fixed union because the API might add services. The component handles unknown keys gracefully via the `??` fallback.

## Impress the Interviewer

The four-state rendering model is the standout feature. Most developers handle two states (loading and success) or three (loading, success, error). This component handles four: initial loading, success, stale data with refresh error, and total failure. The stale-while-revalidate state is the one most developers miss — showing last-known-good data with a warning is strictly better than showing nothing when a refresh fails. In an interview, walk through each state and explain why the stale data path exists. It shows you think about failure modes beyond "show an error message."
