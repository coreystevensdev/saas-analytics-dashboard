# generate-screenshots.ts — Interview Companion

## Elevator Pitch

A script that takes portfolio-quality screenshots of the dashboard automatically. It launches a real browser, navigates to the running app, waits for charts and AI summaries to finish rendering, then saves both light and dark mode captures. No manual screenshots, no Photoshop — the same command reproduces them every time.

**How to say it in an interview:** "It's a Playwright automation script that captures deterministic hero screenshots of the dashboard in both theme variants. It handles hydration timing, animation settle, and client-side state injection for dark mode."

## Why This Approach

### Decision: Playwright library API, not the test runner

**What's happening:** Playwright ships two things. The test runner (`test()`, `expect()`, fixtures) is built for E2E tests — parallelism, retries, reporters. The library API (`chromium.launch()`) is just browser automation. This script takes a screenshot. It doesn't assert anything. So you use the raw library API and skip the test runner overhead entirely.

**How to say it in an interview:** "I used Playwright's browser automation API directly since this is a capture script, not a test. The test runner's lifecycle management — retries, parallelism, reporters — would add complexity without benefit."

**Over alternative:** Using the test runner would mean wrapping the capture in `test('screenshot', ...)` and dealing with timeouts, reporter output, and retry logic for something that should either work or fail clearly.

### Decision: Fresh browser per capture

**What's happening:** Each screenshot (light mode, dark mode) launches its own browser from scratch. Think of it like opening a brand-new incognito window for each picture. That way the dark mode capture can't accidentally inherit state from the light mode one.

**How to say it in an interview:** "I opted for browser-per-capture isolation over context reuse. The dark mode variant needs localStorage seeded before navigation, so clean browser state guarantees no bleed between captures."

**Over alternative:** Reusing one browser with two contexts would be faster by about a second. But you'd need to manually clear localStorage between captures, and debugging state-bleed issues in a screenshot script isn't worth the milliseconds saved.

### Decision: localStorage injection via addInitScript

**What's happening:** The app uses `next-themes`, a popular React library for theme switching. It works by reading `localStorage('theme')` when the page loads and adding `class="dark"` to the HTML element. Tailwind's dark mode styles look for that class. The obvious approach — telling the browser to report dark mode via `emulateMedia({ colorScheme: 'dark' })` — changes the CSS media query, but `next-themes` doesn't read that. It reads localStorage.

`page.addInitScript()` runs a snippet of JavaScript *before* the page loads. So you set `localStorage.setItem('theme', 'dark')` before React hydrates, and `next-themes` picks it up naturally.

**How to say it in an interview:** "The theme library reads localStorage on hydration, not the CSS media query. I use addInitScript to seed the storage value before any page scripts execute, so the theme provider hydrates with the correct class from the start."

**Over alternative:** `emulateMedia({ colorScheme: 'dark' })` would give you a light-mode page with a dark system preference — the CSS class never gets applied, so you'd screenshot the wrong thing.

## Code Walkthrough

### Constants and setup (lines 14–26)

Five constants drive the whole script. `OUT_DIR` resolves to `docs/screenshots/` relative to the script location. `BASE_URL` defaults to `localhost:3000` but can be overridden via env var (useful if someone runs the stack on a different port). `VIEWPORT` sets 1280x800 — standard laptop resolution, wide enough for a two-column dashboard layout. `ANIMATION_SETTLE_MS` at 1200ms pads past Recharts' 500ms default animation duration.

The `__dirname` trick (`dirname(fileURLToPath(import.meta.url))`) is the ESM equivalent of CommonJS `__dirname`. ES modules don't have `__dirname` built in, so you reconstruct it from the module's URL.

### waitForDashboard (lines 28–40)

Three sequential waits that ensure the page is actually *done* rendering, not just DOM-present:

1. **AI summary card** — waits for the ARIA-labeled region to appear. The seed data dashboard fetches a cached summary via SWR. Until that fetch completes and React renders the card, this selector won't match. The 30-second timeout accounts for cold Docker starts where the API is still warming up.

2. **Chart SVG** — waits for a `<figure>` containing an `<svg>`. Recharts renders its LineChart and BarChart as SVG inside figure wrappers. No SVG means data hasn't arrived from the API yet.

3. **Animation settle** — a fixed 1200ms pause. Recharts animates line drawing and bar growth over 500ms. CSS fade-in transitions add more. The buffer ensures you capture the final state, not mid-animation.

**How to say it in an interview:** "I layer three wait strategies: content presence for the AI card, DOM structure for chart rendering, then a fixed delay for animation completion. Each targets a different stage of the render pipeline."

### capture function (lines 42–61)

This is the main workhorse. It launches a browser, optionally injects dark mode, navigates, waits for content, takes the screenshot, and tears down. The `networkidle` wait strategy in `goto()` means Playwright waits until there are no network requests for 500ms — so SWR fetches are complete before `waitForDashboard` even starts checking the DOM.

### main function (lines 63–77)

Ensures the output directory exists, captures both variants sequentially, and logs results. The `.catch()` at the end converts unhandled rejections into a non-zero exit code — important for CI scripts, where a silent failure is worse than a loud crash.

## Complexity and Trade-offs

This is a straightforward automation script — no algorithms, no data structures, no O(n) concerns. The complexity lives in timing.

**What would break first:** The CSS selectors. If someone renames the AI summary card's `aria-label` or wraps charts differently, the wait selectors fail. These are coupled to the component markup. You could use `data-testid` attributes for more stable selectors, but that means adding test infrastructure to production components for a screenshot script.

**The fixed timeout is a code smell.** `waitForTimeout(1200)` is a heuristic. If Recharts changes its default animation duration, or someone adds a longer CSS transition, you'd capture mid-animation again. A more robust approach would poll for animation completion (check that SVG path `d` attributes stop changing), but that's overengineering for a script that runs once.

**No headless flag.** The script uses `chromium.launch()` without `{ headless: true }` — Playwright defaults to headless mode anyway. If you wanted to debug the capture visually, you'd pass `{ headless: false }` to watch the browser.

**How to say it in an interview:** "The main fragility is selector coupling to component markup. In a production test suite I'd use data-testid attributes, but for a portfolio screenshot script, ARIA selectors are a reasonable trade-off between stability and avoiding test-only DOM pollution."

## Patterns and Concepts Worth Knowing

### Browser automation vs. testing

**What it is:** Browser automation means controlling a browser programmatically — click buttons, fill forms, take screenshots. Testing *uses* browser automation but adds assertions, retries, and reporting on top. Playwright offers both: `chromium.launch()` for raw automation, `test()` for the full test framework.

**Where it appears:** The entire script. We import `chromium` from `@playwright/test` (because pnpm hoisting) but never use `test()`, `expect()`, or any test primitives.

**How to say it in an interview:** "Playwright's library API decouples browser automation from testing concerns. This script needs the browser, not the test lifecycle."

### Pre-navigation state injection

**What it is:** Running JavaScript in the page context *before* the page loads. Useful for seeding localStorage, cookies, or global variables that client-side libraries read on initialization.

**Where it appears:** `page.addInitScript(() => localStorage.setItem('theme', 'dark'))` — sets the theme before `next-themes` hydrates.

**How to say it in an interview:** "addInitScript lets you inject state before any page scripts execute, which is necessary when client-side libraries read localStorage synchronously during hydration."

### Network-idle navigation

**What it is:** Instead of waiting for the DOM to load (`domcontentloaded`) or all resources to finish (`load`), `networkidle` waits until there are no in-flight network requests for 500ms. This catches async data fetching (like SWR calls) that happens after the initial page load.

**Where it appears:** `page.goto(url, { waitUntil: 'networkidle' })`.

**How to say it in an interview:** "networkidle ensures client-side data fetching completes before we start checking the DOM, which is important for SWR-driven dashboards where content loads asynchronously after hydration."

### ESM __dirname reconstruction

**What it is:** CommonJS gives you `__dirname` for free — it's the folder containing the current file. ES modules dropped it. The workaround: `import.meta.url` gives you the file's URL (`file:///path/to/script.ts`), `fileURLToPath` strips the protocol to a real path, and `dirname` gets the folder.

**Where it appears:** Lines 20-21.

**How to say it in an interview:** "ES modules don't provide __dirname, so I reconstruct it from import.meta.url. It's a standard ESM pattern for resolving paths relative to the script's location."

## Potential Interview Questions

### Q: Why not use Puppeteer instead of Playwright?

**Context if you need it:** Puppeteer is Google's browser automation library — Chromium only. Playwright is Microsoft's — supports Chromium, Firefox, and WebKit. Both have similar APIs. The real question is about dependency management.

**Strong answer:** "Playwright was already in the project as a devDependency for E2E tests. Using Puppeteer would mean a second browser automation library doing the same thing. Since the script only needs Chromium, either library works, but sharing the dependency avoids download duplication."

**Red flag answer:** "Puppeteer is outdated" — it's not, it's actively maintained. The real reason is dependency hygiene, not quality.

### Q: What happens if the dashboard takes longer than 30 seconds to load?

**Context if you need it:** The AI summary card wait has a 30-second timeout. The question tests whether you've thought about failure modes.

**Strong answer:** "waitForSelector throws a TimeoutError, the catch handler logs it and exits with code 1. In practice 30 seconds is generous — the seed summary is pre-cached, so the API just reads from the database. If it takes longer, something is wrong with the Docker stack, not the timeout."

**Red flag answer:** "I'd increase the timeout to 60 seconds" — that masks the real problem instead of diagnosing it.

### Q: How would you add a mobile screenshot variant?

**Context if you need it:** The current script captures at 1280x800 (desktop). Mobile would need a different viewport and possibly different wait logic if the layout changes.

**Strong answer:** "Add a viewport parameter to the capture function — something like `{ width: 390, height: 844 }` for iPhone 14. The wait selectors should still work since they target ARIA attributes, not layout. You'd want a third call in main: `capture('hero-mobile', false, mobileViewport)`."

**Red flag answer:** "Use `page.setViewportSize()` after navigation" — that would trigger a re-layout mid-render and potentially capture a transitional state.

### Q: Why not commit the screenshots to git and skip the script?

**Context if you need it:** This tests whether you understand reproducibility vs. convenience.

**Strong answer:** "Manual screenshots rot. The dashboard changes every sprint — new features, theme tweaks, data changes. A script guarantees the README screenshots match the current UI. It's also self-documenting: the script is the specification for what the hero shot should contain."

**Red flag answer:** "Screenshots are binary files that bloat the repo" — that's a real concern, but the primary reason is reproducibility, not repo size.

### Q: Could the dark mode screenshot show the wrong theme if there's a race condition?

**Context if you need it:** The question probes whether `addInitScript` actually runs before hydration. A race condition would mean React hydrates *before* localStorage is set, and `next-themes` picks the wrong theme.

**Strong answer:** "No — addInitScript runs before any page scripts execute. Playwright injects it at the page level before the document starts loading. By the time React's bundle downloads, parses, and hydrates, the localStorage value has been set for hundreds of milliseconds. There's no race."

**Red flag answer:** "We could add a retry loop to check the theme class" — that implies misunderstanding of when addInitScript runs.

## Data Structures and Algorithms

This script uses no meaningful data structures or algorithms. It's a linear sequence of browser automation commands: launch → configure → navigate → wait → capture → close. No collections, no lookups, no iteration beyond calling `capture()` twice with different arguments.

The only "data structure" worth mentioning is Playwright's internal page object, which maintains a handle to the browser tab's DOM. But that's library internals, not something you designed.

## Impress the Interviewer

### The hydration timing model

**What's happening:** The script's wait strategy mirrors the page's rendering pipeline: network requests complete (SWR fetches) → DOM updates (React renders components) → animations settle (Recharts draws, CSS transitions finish). Each `waitFor` call targets a specific stage.

**Why it matters:** A naive `setTimeout(5000)` would work *most* of the time but fail intermittently when Docker is slow or the API is under load. Declarative waits are deterministic — they succeed as soon as the condition is met, and fail loudly when something is actually broken.

**How to bring it up:** "The wait strategy follows the rendering pipeline: I wait for network completion via networkidle, then DOM presence via selectors, then a fixed buffer for CSS and SVG animations. Each layer catches a different class of timing issue."

### Reproducible artifacts over manual processes

**What's happening:** The README could just include manually taken screenshots. Instead, a script generates them. Anyone can re-run `pnpm screenshots` after a UI change and get updated hero images.

**Why it matters:** In a team environment, manual screenshots become stale the moment someone changes a color or moves a component. They're also impossible to reproduce exactly — different screen sizes, different data states, different browser zoom levels. The script pins all of those.

**How to bring it up:** "I treat screenshots as build artifacts, not static assets. The script pins viewport, data state, and theme, so anyone on the team can regenerate them after UI changes. It's the same philosophy as snapshot testing — make the expected output reproducible."

### The pnpm hoisting constraint

**What's happening:** The import uses `@playwright/test` instead of `playwright` directly. In a regular npm project, both would resolve fine. But pnpm uses strict hoisting — packages can only import their direct dependencies, not transitive ones. `playwright` is a dependency of `@playwright/test`, not of the root workspace, so pnpm won't let the script import it.

**Why it matters:** This is the kind of "it works on my machine" bug that wastes hours. The import looks wrong (why import from a test package in a non-test script?) but it's the correct solution given pnpm's module resolution rules.

**How to bring it up:** "The import path looks counterintuitive — importing chromium from the test package in a non-test script. But pnpm's strict dependency hoisting means transitive dependencies aren't directly importable. It's a trade-off of pnpm's correctness guarantees."
