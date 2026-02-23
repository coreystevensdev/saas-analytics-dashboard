# ResponsiveToaster — Interview-Ready Documentation

## Elevator Pitch

A toast notification wrapper that adapts its position based on device size and respects the user's dark/light mode preference. On mobile, toasts appear at the top-center (where your thumb isn't); on desktop, they sit in the bottom-right corner (standard convention).

## Why This Approach

The `sonner` library's `Toaster` component accepts a static `position` prop — it doesn't adapt to screen size on its own. This wrapper reads two pieces of runtime state (viewport size via `useIsMobile`, color scheme via `useTheme`) and passes them as props. It's a composition pattern: wrap a third-party component to inject app-specific behavior.

An alternative would be CSS-based positioning with media queries, but `sonner` controls its own positioning via inline styles, so you'd be fighting the library. Passing the right prop is cleaner.

## Code Walkthrough

- **`'use client'`**: Required because both `useIsMobile` and `useTheme` are hooks that need browser APIs.
- **`useIsMobile()`**: Custom hook (likely using `matchMedia` or `window.innerWidth`) that returns a boolean. Avoids hydration mismatches by using `useSyncExternalStore` under the hood.
- **`useTheme()`**: From `next-themes`. `resolvedTheme` gives you the actual computed theme (respects system preference), not just what the user explicitly set.
- **`richColors`**: Sonner prop that uses more saturated success/error colors instead of the default muted palette.

## Complexity & Trade-offs

Low complexity. The trade-off is a runtime check for mobile vs. a CSS-only approach — but since sonner uses JS positioning, this is the right call. One minor concern: `useIsMobile` fires a re-render on resize, but since this component is tiny, the cost is negligible.

## Patterns Worth Knowing

- **Adapter/wrapper pattern**: When a third-party component doesn't integrate with your app's state (theme, responsive breakpoints), wrap it in a thin component that bridges the gap. You're not forking the library — you're composing around it.
- **`resolvedTheme` vs `theme`**: `next-themes` distinguishes between the user's explicit choice and the resolved value (which accounts for `system` preference). Always use `resolvedTheme` when passing to components that need `'light' | 'dark'`.

## Interview Questions

**Q: Why not just use CSS media queries for toast positioning?**
A: Sonner positions toasts with inline JavaScript styles, not CSS classes. You can't override inline styles with media queries (without `!important` hacks). Passing the correct `position` prop is the intended API.

**Q: What's the hydration risk with `useIsMobile`?**
A: Server-side rendering doesn't know the viewport size. If you naively use `window.innerWidth` in state initialization, the server renders one position and the client hydrates with another — a mismatch. The fix is `useSyncExternalStore` with a server snapshot that defers to a safe default until the client mounts.

**Q: Why is this a separate component instead of inline in the layout?**
A: It uses two hooks, which means it re-renders when theme or viewport changes. Isolating it prevents those re-renders from bubbling up to the layout. It's a render boundary.

## Data Structures

```typescript
// Props passed to sonner's Toaster
position: 'top-center' | 'bottom-right'
theme: 'light' | 'dark' | undefined
richColors: boolean
```

## Impress the Interviewer

The interesting principle here is **render isolation**. This component re-renders on every viewport resize (through `useIsMobile`) and every theme toggle. By wrapping it in its own component, those re-renders are contained — the parent layout doesn't re-render. In React 19, this matters less with the compiler's automatic memoization, but it's still good architecture: components that re-render frequently should be small and isolated.
