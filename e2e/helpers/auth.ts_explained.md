# auth.ts — Interview-Ready Documentation

## Elevator Pitch

A helper that authenticates Playwright browser contexts by minting a real JWT and injecting it as an httpOnly cookie. Instead of going through the login flow in every E2E test, you call `authenticateAs(ctx, user)` and the browser context is immediately authenticated — no login page, no OAuth redirect, no waiting for a token exchange.

## Why This Approach

E2E tests that go through the actual login flow are slow and brittle. OAuth flows involve third-party redirects (Google), CAPTCHA risks, and session state that's hard to control. Since the goal of most E2E tests is to test what happens *after* login, faking the auth token is the right move.

The key insight: we're not mocking auth. We're minting a real JWT using the same signing secret the API uses. The API can't tell the difference between a token from the login flow and one from this helper. It's the same cryptographic verification path. The only thing we skip is the OAuth handshake.

## Code Walkthrough

The function takes a Playwright `BrowserContext` and a user object with `userId`, `orgId`, `role`, and `isAdmin`.

1. **Build the JWT** using `jose`'s `SignJWT`. The payload matches the API's expected token shape: `org_id`, `role`, and `isAdmin` in the body, `userId` as the `sub` (subject) claim. Algorithm is HS256 — symmetric signing with a shared secret.

2. **Set standard claims**: `iat` (issued at) via `setIssuedAt()` and `exp` (expiration) via `setExpirationTime('15m')`. The 15-minute window is long enough for any test to complete.

3. **Inject the cookie** using Playwright's `context.addCookies()`. The cookie name (`access_token`), flags (`httpOnly`, `sameSite: 'Lax'`), and domain (`localhost`) all match what the real auth flow produces. The browser will send this cookie on every subsequent request automatically.

The `secret` is derived from the `JWT_SECRET` config value, encoded to a `Uint8Array` as `jose` requires.

## Complexity & Trade-offs

**Gained**: Tests run in seconds instead of minutes. No dependency on Google OAuth, no network calls to external services, no risk of rate limiting or CAPTCHA challenges during CI.

**Sacrificed**: The login flow itself isn't tested by tests that use this helper. You'd want a separate, dedicated test for the actual login flow — but only one, not one per feature test.

**Security note**: The `JWT_SECRET` used in tests is a hardcoded CI value (`ci-test-secret-that-is-at-least-32-chars-long-for-validation`), not a production secret. This is fine — E2E tests run against local environments only.

## Patterns Worth Knowing

**Token injection for test authentication** — this is the standard pattern for E2E test suites in apps with token-based auth. You'll see it in Cypress (via `cy.setCookie`), Playwright (via `context.addCookies`), and even Selenium. In an interview, call it "programmatic authentication" — you bypass the UI login to isolate tests from auth infrastructure.

**jose library for JWT** — `jose` is a modern, standards-compliant JWT library that works in both Node.js and edge runtimes. It uses the Web Crypto API under the hood. The `SignJWT` builder pattern (method chaining with `.setProtectedHeader().setSubject().sign()`) is idiomatic.

## Interview Questions

**Q: Why not just use the real login flow in E2E tests?**
A: Speed and reliability. OAuth involves third-party redirects, network calls, and UI interactions that add 5-10 seconds per test. Multiplied by 20+ tests, that's minutes of wasted time. More importantly, flaky OAuth redirects cause false test failures that erode trust in the test suite.

**Q: How do you ensure the test JWT matches what the production auth flow produces?**
A: The JWT payload shape (`org_id`, `role`, `isAdmin`, `sub`) must match the API's token verification middleware. If the auth middleware changes what it expects, tests using this helper will fail — which is the correct behavior. The helper is coupled to the auth contract, not to the login UI.

**Q: Is there a security concern with using a shared JWT secret in tests?**
A: The secret is a hardcoded CI value that's never used in production. The `config.ts` helper has a safety check that refuses to run against non-localhost databases, so even if the secret leaked, it can't be used to mint tokens for production.

## Data Structures

The `user` parameter:
```typescript
{ userId: number; orgId: number; role: 'owner' | 'member'; isAdmin: boolean }
```

Maps directly to the JWT claims the API expects. `userId` becomes the `sub` claim, the rest go in the payload body.

## Impress the Interviewer

The cookie attributes (`httpOnly: true`, `sameSite: 'Lax'`, `domain: 'localhost'`) match the production auth flow exactly. A lazy implementation would skip `httpOnly` or use `sameSite: 'None'`, and the tests would still pass — but they'd be testing against a different cookie configuration than production. This attention to detail means the tests catch bugs like "the API started requiring `Strict` sameSite and now the cookie doesn't get sent on cross-origin requests." In an interview, you can say: "The test helper mirrors the exact cookie configuration the auth flow sets, so we're validating the same security posture."
