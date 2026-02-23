# ShareMenu.tsx — Interview-Ready Documentation

## Elevator Pitch

ShareMenu is a responsive share UI that lets users download an AI insight as a PNG, copy it to the clipboard, or generate a shareable link. On desktop it renders as a popover dropdown; on mobile it becomes a bottom sheet (slide-up panel). It manages multiple concurrent async operations — image generation, link creation — with per-action feedback states and proper focus management.

## Why This Approach

Share menus look simple but have a surprising number of states to juggle. You've got three actions (download, copy image, copy link), each with their own async lifecycle, plus a feedback system ("Copied!"), plus two different presentation modes based on screen size. This component splits the problem into layers:

1. **`ShareOptions`** — The action buttons and their state feedback. Pure UI, no positioning logic.
2. **`ShareMenu`** — Desktop popover. Handles open/close, click-outside, focus management.
3. **`ShareFab`** — Mobile floating action button. Opens a bottom `Sheet` with the same `ShareOptions`.

The alternative would be one big component with responsive logic throughout, but that tangles positioning concerns with action logic. By extracting `ShareOptions`, the same button list renders identically in both the popover and the sheet.

The component doesn't use a third-party popover library (like Radix or Floating UI). The popover is positioned with CSS (`absolute right-0 top-full`), which works here because the trigger is in a predictable location. For a popover that could clip against viewport edges, you'd want a library. This one doesn't need it.

## Code Walkthrough

### Feedback system

```typescript
type ActionFeedback = 'idle' | 'downloaded' | 'copied' | 'linked';

const showFeedback = useCallback((type: ActionFeedback) => {
  clearTimeout(feedbackTimer.current);
  setFeedback(type);
  feedbackTimer.current = setTimeout(() => setFeedback('idle'), FEEDBACK_DURATION_MS);
}, []);
```

Only one feedback message shows at a time. If you copy and then immediately download, the download feedback replaces the copy feedback — `clearTimeout` cancels the previous timer. The ref-based timer (`feedbackTimer.current`) persists across renders without causing them, and the cleanup effect clears it on unmount to prevent memory leaks.

### Action handlers

```typescript
const handleDownload = useCallback(async () => {
  await onGenerate();
  onDownload();
  showFeedback('downloaded');
}, [onGenerate, onDownload, showFeedback]);
```

Each action first calls `onGenerate()` (which captures the insight card as a canvas/blob). This is idempotent — if the image is already generated, `onGenerate` returns immediately. Then the specific action runs. This `await`-then-act pattern means the image is always ready before you try to download or copy it.

### Click-outside handling

```typescript
useEffect(() => {
  if (!open) return;
  function onDocClick(e: MouseEvent) {
    if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
      setOpen(false);
    }
  }
  document.addEventListener('mousedown', onDocClick);
  return () => document.removeEventListener('mousedown', onDocClick);
}, [open]);
```

Classic click-outside pattern. The event listener only exists while the menu is open — the early return prevents unnecessary global listeners. Using `mousedown` instead of `click` catches the interaction earlier, before `mouseup` (which is when `click` fires). This feels more responsive and prevents the edge case where a user drags from inside the menu to outside.

### Focus management

```typescript
useEffect(() => {
  if (open) {
    const firstBtn = panelRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)');
    firstBtn?.focus();
  }
}, [open]);
```

When the popover opens, focus moves to the first enabled button. This is an accessibility requirement — keyboard users need to know the menu opened and interact with it immediately. The `Escape` handler moves focus back to the trigger button, completing the focus trap cycle.

### Mobile FAB and Sheet

```typescript
export function ShareFab({ visible, ... }: ShareFabProps) {
  const isMobile = useIsMobile();
  if (!visible || !isMobile) return null;
  ...
}
```

`ShareFab` early-returns if not mobile or not visible. The `visible` prop is controlled by the parent — it only appears after the AI summary finishes streaming (you can't share an incomplete insight). The Sheet component from shadcn/ui provides the bottom slide-up panel with built-in backdrop, animation, and focus trapping.

### Accessibility details

Every loading spinner has `role="status"` and `aria-live="polite"` so screen readers announce state changes. Icons use `aria-hidden="true"` because the button text already describes the action. The trigger button has `aria-expanded` and `aria-haspopup` to communicate the popover relationship.

## Complexity & Trade-offs

This is the most complex component in this batch, and justifiably so. Share UIs accumulate real-world edge cases:

- **Image generation is async** — You can't download or copy before it's ready. The `onGenerate()` call gates both actions.
- **Clipboard API can fail** — On iOS Safari, clipboard access is restricted. The `linkClipboardFailed` prop handles this gracefully with a fallback message.
- **Two presentation modes** — The popover and sheet share action logic but differ in positioning, animation, and dismissal behavior.
- **Multiple concurrent states** — Image generation status, link creation status, and feedback are all independent.

What's sacrificed: the popover doesn't reposition itself if it would clip the viewport edge. For this app's layout (the share button is in a known position within the dashboard), that's acceptable. A general-purpose popover library would handle viewport collision detection.

The `ShareOptions` component is extracted but not memoized with `React.memo`. Given that its props include callback functions that get recreated on render (from the parent), memoization would need the parent to stabilize those callbacks too. The render cost of this component is low enough that memoization isn't worth the complexity.

## Patterns Worth Knowing

- **Compound component split** — `ShareOptions` is the "headless" action list, `ShareMenu` is the desktop shell, `ShareFab` is the mobile shell. Same data, different chrome. This is a lightweight version of the headless UI pattern (like Radix or Headless UI).
- **Ref-based timers** — `useRef` for `setTimeout` IDs prevents stale closures and avoids including the timer in the dependency array. The ref persists across renders; the value it holds doesn't trigger re-renders.
- **Conditional event listeners** — Only attaching the click-outside listener when the menu is open. Reduces the number of global listeners and makes the cleanup path obvious.
- **`motion-reduce:duration-0`** — Tailwind utility that disables animation for users who've set `prefers-reduced-motion` in their OS. Applied to the popover entrance animation, the sheet transition, and the FAB. This is an accessibility requirement, not a nice-to-have.
- **Discriminated feedback type** — `ActionFeedback` is a union of literal strings, not a boolean `showFeedback` + string `feedbackMessage`. The union makes it impossible to show feedback text for the wrong action.

## Interview Questions

**Q: Why not use Radix UI's Popover for the desktop menu?**
A: Radix would give you viewport collision detection, built-in focus trapping, and managed ARIA attributes. The trade-off is bundle size and the abstraction layer. This popover is positioned in a predictable location (top-right of a card), so collision detection isn't needed. Focus management and ARIA are handled manually in ~10 lines. For a design system component used in many contexts, Radix is the right call. For a one-off menu in a known layout position, hand-rolling is fine.

**Q: How would you test the click-outside behavior?**
A: In a test using Testing Library, you'd render the component, click the trigger to open it, then dispatch a `mousedown` event on `document.body` (or any element outside the container). Assert that the panel disappears. The key detail is using `mousedown`, not `click`, since that's what the handler listens for. You'd also test that clicking inside the panel doesn't close it.

**Q: What happens if the user clicks "Download" while the image is still generating from a previous "Copy" click?**
A: `onGenerate()` is designed to be idempotent — if generation is already in progress, it either awaits the same promise or returns immediately if done. The `disabled={isGenerating}` attribute on the buttons prevents double-clicks during the active generation, but even without it, the idempotent `onGenerate` prevents redundant work.

**Q: Why use a Sheet on mobile instead of the same popover?**
A: Mobile popovers are problematic — they often clip against the viewport, the touch target for click-outside is the entire screen (which conflicts with scrolling), and they don't follow mobile UI conventions. A bottom sheet is the expected mobile pattern for action menus (iOS action sheets, Android bottom sheets). It slides up from the bottom, has a large backdrop for dismissal, and keeps thumb targets in the bottom half of the screen.

**Q: How does `aria-live="polite"` work for the feedback messages?**
A: When an element with `aria-live="polite"` has its content change, screen readers announce the new content after finishing whatever they're currently reading. So when "Copied to clipboard!" appears, a screen reader user hears it without interrupting their current context. `"polite"` is correct here — the feedback isn't urgent enough for `"assertive"`, which would interrupt immediately.

## Data Structures

```typescript
type ShareStatus = 'idle' | 'generating' | 'done' | 'error';
type LinkStatus = 'idle' | 'creating' | 'done' | 'error';
type ActionFeedback = 'idle' | 'downloaded' | 'copied' | 'linked';
```

Three independent state machines:
- **`ShareStatus`** tracks PNG image generation (canvas capture)
- **`LinkStatus`** tracks shareable URL creation (API call)
- **`ActionFeedback`** tracks which action just completed (for showing temporary confirmation text)

The props use callback functions for all actions (`onGenerate`, `onDownload`, `onCopy`, `onCopyLink`). The parent owns the actual implementation — this component just orchestrates the UI around them.

## Impress the Interviewer

Two things stand out. First, the accessibility work is thorough without being theatrical. Focus management, `aria-expanded`, `aria-live` regions, `motion-reduce` support, keyboard dismissal — these aren't afterthoughts bolted on; they're woven into the component's event handling from the start. In an interview, you can talk about each one and explain *why* it exists (not just that "accessibility is important").

Second, the responsive strategy is clean. Instead of a single component with media query conditionals scattered through the JSX, there's a shared `ShareOptions` core rendered inside two different containers. The desktop container is a CSS-positioned popover. The mobile container is a Sheet. Neither knows about the other. If you later added a third context (like a context menu or a toolbar), you'd reuse `ShareOptions` again without touching it.
