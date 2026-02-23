# useShareInsight — Interview-Ready Documentation

## Elevator Pitch

A hook that captures a DOM node as a PNG image, then lets users download it or copy it to their clipboard. Think of it as a "screenshot this component" button — it turns an AI insight card into a shareable image for social media, Slack, or email. The hook manages the capture lifecycle, caches the result, and handles the two distinct output modes (download vs. clipboard).

## Why This Approach

The alternative to client-side PNG generation is server-side rendering (Puppeteer, Playwright). That's heavier infrastructure, adds latency, and requires the server to replicate the exact same styles. `html-to-image` (which wraps SVG foreignObject serialization) runs entirely in the browser — zero server cost, instant results, and what-you-see-is-what-you-get fidelity.

The hook accepts a `RefObject` so the consumer controls *what* gets captured. This makes it reusable — you could point it at a chart, a card, or an entire dashboard section.

## Code Walkthrough

- **`nodeRef` parameter**: A React ref pointing to the DOM element to capture. The hook doesn't own the ref — it receives it. This inversion of control means the component decides the capture boundary.
- **`dataUrlRef`**: A `useRef` (not `useState`) stores the generated data URL. Why ref instead of state? Because changing it shouldn't trigger a re-render. The PNG is a cached artifact — the UI cares about `status`, not the raw data URL.
- **`generatePng`**: The main function. It does three things:
  1. **Short-circuits** if `dataUrlRef.current` already exists — no redundant DOM walks.
  2. **Races** `toPng()` against a timeout promise. `Promise.race` returns whichever settles first. If the timeout wins, the PNG generation is abandoned.
  3. **Tracks analytics** on success.
- **`downloadPng`**: Creates a temporary `<a>` element with a `download` attribute, clicks it programmatically, and removes it. This is the standard browser trick for triggering a file download from a data URL — there's no cleaner API.
- **`copyToClipboard`**: Converts the data URL to a Blob (via `fetch` on the data URL — yes, you can fetch data URLs), then uses `ClipboardItem` to write the image. The Clipboard API requires Blobs for non-text content; you can't just `writeText` a data URL.
- **Timeout via `Promise.race`**: If `toPng` takes longer than `timeoutMs` (default 10s), the reject from the timeout promise wins the race. The `clearTimeout` in both paths prevents the timeout from firing after success.

## Complexity & Trade-offs

Medium-high complexity. Here's what was gained and sacrificed:

- **Gained**: Zero server infrastructure for image export. Pixel-perfect capture (it renders exactly what the user sees). Cached result (generate once, download/copy many times).
- **Sacrificed**: `html-to-image` can't capture cross-origin images or some CSS features (backdrop-filter, some gradients). If the insight card used external fonts loaded from a CDN, you'd need to inline them. The project sidesteps this by using system fonts and locally-loaded assets.
- **Memory**: The data URL stays in memory until the component unmounts (it's in a ref). For a single PNG of a card, this is kilobytes — not a concern. For a full-page screenshot at 2x DPI, it could be megabytes.

## Patterns Worth Knowing

- **`useRef` for non-render state**: `dataUrlRef` is state that the component doesn't need to display directly. Using `useRef` instead of `useState` avoids unnecessary re-renders. In an interview, you'd say: "I use refs for values that change but don't affect the rendered output."
- **`Promise.race` for timeouts**: A clean alternative to `AbortController` when the underlying API doesn't support abort signals. You race the real operation against a timer. The losing promise's result is ignored.
- **Programmatic download via anchor element**: `document.createElement('a')` with `href` and `download` attributes is how you trigger file downloads in the browser without navigating. The element doesn't need to be visible — you just need it in the DOM momentarily.
- **`fetch` on data URLs**: This is a lesser-known browser feature. `fetch('data:image/png;base64,...')` returns a Response you can call `.blob()` on. It's the cleanest way to convert a data URL to a Blob without manual base64 decoding.

## Interview Questions

**Q: Why use `useRef` for the data URL instead of `useState`?**
A: The data URL is a cached artifact, not display state. Storing it in `useState` would trigger a re-render when the PNG finishes generating, but the component already re-renders from the `status` state change. The ref avoids a redundant render cycle. The component reads `dataUrlRef.current` in event handlers (download, copy), not during rendering.

**Q: What happens if the user clicks "Download" before "Generate"?**
A: `downloadPng` checks `if (!dataUrlRef.current) return` — it's a no-op. The button should be disabled in the UI when `status !== 'done'`, but the hook is defensive regardless.

**Q: How does `toPng` work under the hood?**
A: It serializes the DOM node to SVG via `foreignObject`, renders that SVG to a canvas, then exports the canvas as a PNG data URL. The key limitation is that `foreignObject` rendering doesn't support all CSS features and can't load cross-origin resources.

**Q: Why not use `html2canvas` instead of `html-to-image`?**
A: `html-to-image` produces better output for modern CSS (flexbox, grid, CSS variables) and generates smaller bundles. `html2canvas` re-implements the browser's rendering engine in JavaScript, which is impressive but slower and more prone to visual differences. `html-to-image` leverages the browser's own rendering via SVG foreignObject.

**Q: How would you support capturing at 2x resolution for Retina displays?**
A: `toPng` accepts a `pixelRatio` option. Passing `{ pixelRatio: 2 }` doubles the canvas resolution. The trade-off is a 4x larger file (2x width * 2x height). You could detect `window.devicePixelRatio` and pass it dynamically.

## Data Structures

```typescript
type ShareStatus = 'idle' | 'generating' | 'done' | 'error';

interface UseShareInsightOptions {
  timeoutMs?: number;  // default 10_000
}

// Return value
interface UseShareInsightReturn {
  status: ShareStatus;
  generatePng: () => Promise<void>;   // captures the DOM node
  downloadPng: () => void;            // triggers file download
  copyToClipboard: () => Promise<void>; // writes PNG to clipboard
}

// Internal: dataUrlRef holds 'data:image/png;base64,...' after generation
```

## Impress the Interviewer

Two things stand out here. First, the **caching via ref** — `generatePng` short-circuits if the image already exists. This matters because DOM-to-image conversion is expensive (serializing the entire subtree). A user who clicks "Copy" after "Download" doesn't pay that cost twice.

Second, the **`fetch` on a data URL** trick in `copyToClipboard`. Most developers would write manual base64 decoding code (`atob`, `Uint8Array`, `new Blob`). Using `fetch` on the data URL is three lines and leverages the browser's built-in decoder. If you mention this in an interview, it signals that you know the platform APIs well enough to avoid reinventing them.
