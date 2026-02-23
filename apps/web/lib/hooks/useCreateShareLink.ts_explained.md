# useCreateShareLink — Interview-Ready Documentation

## Elevator Pitch

A custom hook that creates a shareable link for a dataset's AI insights, copies it to the clipboard, and manages every state transition along the way. It wraps a single POST request in a state machine with abort timeout, error handling, and a graceful clipboard fallback — so the UI always knows exactly what to show.

## Why This Approach

Share link creation involves three distinct failure modes: the network request can fail, the request can hang, and the clipboard write can fail (permissions, insecure context). Handling all three in a component would mean a tangle of `try/catch` blocks and state variables. Extracting it into a hook isolates the complexity and makes the component a pure function of the hook's return values.

The state machine pattern (`idle → creating → done | error`) means the consuming component never has to guess what's happening. It just switches on `status`.

An alternative would be using SWR's `useSWRMutation`, but the clipboard side-effect and the two-phase error handling (request vs. clipboard) make a manual approach cleaner here.

## Code Walkthrough

- **`LinkStatus` union type**: Four states — `idle`, `creating`, `done`, `error`. This is the backbone. Every piece of UI logic keys off this.
- **`AbortController` + timeout**: A 10-second timeout prevents the UI from hanging if the server is slow. The `AbortController` cancels the fetch, which triggers the `catch` block. The `clearTimeout` in both success and error paths prevents memory leaks.
- **Two-phase success handling**: After the fetch succeeds, the URL is committed to state (`setShareUrl`, `setStatus('done')`) *before* attempting clipboard write. This matters — if clipboard fails, the user still has the URL visible in the UI. The share exists in the database regardless.
- **`clipboardFailed` flag**: A separate boolean (not part of the status machine) because clipboard failure isn't an error state for the share — it's a degraded success. The UI can show "Link created! Copy it manually" instead of a red error.
- **Analytics tracking**: `trackClientEvent` fires on success only. The event name comes from a shared constants package, keeping analytics consistent across the codebase.
- **Empty dependency array**: `createLink` is stable across renders because it captures no external state — all state updates use setters from `useState`, which React guarantees are stable.

## Complexity & Trade-offs

Medium complexity. The trade-offs:

- **Manual fetch vs. SWR mutation**: More code, but full control over the clipboard side-effect and the two-tier error model. SWR mutation would simplify the request part but make the clipboard handling awkward.
- **10s hardcoded timeout**: Works for share link creation (fast DB insert). If the operation were slower (e.g., generating a PDF), you'd want this configurable. The hook could accept `opts` like `useShareInsight` does, but YAGNI for now.
- **No retry**: If creation fails, the user has to click again. For a share link (idempotent operation), this is fine. Adding automatic retry would complicate the state machine.

## Patterns Worth Knowing

- **Explicit state machine via union type**: Instead of separate `isLoading`, `isError`, `isSuccess` booleans (which can get into impossible states like `isLoading && isError`), a single `status` field guarantees mutual exclusivity. In an interview, you'd call this a "discriminated state" or "finite state machine."
- **Graceful degradation**: The clipboard write is a best-effort enhancement. The core functionality (creating the share link) succeeds independently. This is a real-world pattern — browsers restrict clipboard access in insecure contexts (HTTP, iframes), and you need a fallback.
- **AbortController for timeouts**: The standard browser API for canceling fetch requests. Cleaner than letting the request hang and ignoring the response — cancellation frees up the connection.

## Interview Questions

**Q: Why commit the URL to state before attempting clipboard write?**
A: Because the share link already exists in the database at that point. If you waited for clipboard success before updating the UI, a clipboard failure would leave the user staring at a spinner even though their link was created. Separating the two operations means the user always sees their result.

**Q: What happens if the user clicks "Create Link" twice quickly?**
A: The second call resets all state (`setStatus('creating')`, `setShareUrl(null)`, etc.) and fires a new fetch. The first request's response will still arrive, but since `createLink` uses closures over the setter functions (not stale state), both responses write to the same state. In practice, the second response overwrites the first. To prevent this, you could add a guard (`if (status === 'creating') return`), but the current behavior is harmless — the user just gets the newest link.

**Q: Why `useCallback` with an empty dependency array?**
A: `createLink` only references `useState` setters and `trackClientEvent`, both of which are stable references. Without `useCallback`, a new function is created on every render, which would cause any component using `createLink` in a dependency array (or passing it as a prop) to re-render unnecessarily.

**Q: How would you test this hook?**
A: Use `renderHook` from `@testing-library/react`. Mock `fetch` globally, mock `navigator.clipboard.writeText`. Test the happy path (status goes idle → creating → done, shareUrl is set, clipboard called). Test fetch failure (status goes to error, errorMsg is set). Test clipboard failure (status is still done, clipboardFailed is true). Test timeout (mock a slow fetch, assert abort).

**Q: Why not use the browser's `navigator.share()` Web Share API instead?**
A: Web Share shows a native OS share sheet, which is great for mobile but inconsistent on desktop. This hook creates a plain URL that works everywhere. A future version could offer Web Share as an option on mobile alongside the clipboard copy.

## Data Structures

```typescript
type LinkStatus = 'idle' | 'creating' | 'done' | 'error';

// Return value
interface UseCreateShareLinkReturn {
  status: LinkStatus;
  shareUrl: string | null;        // the created URL, null until done
  errorMsg: string | null;        // error description, null unless status === 'error'
  clipboardFailed: boolean;       // true if share succeeded but clipboard write didn't
  createLink: (datasetId: number) => Promise<void>;
}

// API response shape
interface ShareResponse {
  data: { url: string };
}
```

## Impress the Interviewer

The design decision that shows depth is the **separation of clipboard failure from request failure**. Most developers would treat clipboard write as part of the success path — if it fails, the whole operation fails. But that's wrong: the share link exists. The user's data is saved. Clipboard is a convenience, not a requirement. Modeling that distinction with a separate `clipboardFailed` boolean (instead of collapsing it into the error state) shows you think about user experience at the state-management level, not just the happy path.
