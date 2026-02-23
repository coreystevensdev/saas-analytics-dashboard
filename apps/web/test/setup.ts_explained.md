# test/setup.ts — Interview-Ready Documentation

## Elevator Pitch

The global test setup file for the web app's Vitest suite. It does two things: imports jest-dom matchers (so you can write `.toBeInTheDocument()`) and cleans up the DOM after every test.

## Why This Approach

Without `cleanup()`, DOM nodes from one test leak into the next. React Testing Library renders into a shared `document.body`, so leftover nodes cause false positives (queries matching elements from previous tests). The `afterEach(cleanup)` pattern is standard — you'll find it in nearly every React Testing Library setup.

The `@testing-library/jest-dom/vitest` import adds custom matchers (`toBeVisible`, `toHaveTextContent`, `toBeDisabled`, etc.) to Vitest's `expect`. Without it, you'd be stuck with generic matchers like `toBeTruthy()` on DOM queries.

## Code Walkthrough

- **`import '@testing-library/jest-dom/vitest'`**: Side-effect import that extends Vitest's `expect` with DOM-specific matchers. The `/vitest` entry point is required for Vitest (the plain `jest-dom` import is for Jest).
- **`afterEach(cleanup)`**: Unmounts React trees and removes DOM nodes after each test. Prevents test pollution.

## Complexity & Trade-offs

Zero complexity. It's boilerplate, but it's the kind of boilerplate that prevents hard-to-debug test failures when omitted.

## Patterns Worth Knowing

- **Global test setup**: Vitest's `setupFiles` config points to this file. It runs before every test file, so individual tests don't need to import cleanup or matchers.

## Interview Questions

**Q: What happens if you skip `cleanup()`?**
A: DOM nodes from previous tests persist. A query like `screen.getByText('Submit')` might match a button from a prior test instead of the one you just rendered. Tests pass or fail depending on execution order — the worst kind of flakiness.

**Q: Why the `/vitest` subpath for jest-dom?**
A: Vitest and Jest have slightly different `expect` APIs. The `/vitest` entry point uses `expect.extend()` in a way compatible with Vitest's expect implementation.

## Data Structures

None. This file has no exports or data structures.

## Impress the Interviewer

If asked about test setup, mention that this is intentionally minimal. Some projects add global mocks (fetch, IntersectionObserver, matchMedia) in setup files. This project keeps those mocks in individual test files or colocated `__mocks__` directories, so the global setup stays lean and each test file documents its own dependencies.
