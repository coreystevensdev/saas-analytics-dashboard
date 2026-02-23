# login/page.tsx — Interview-Ready Documentation

## Elevator Pitch

The login page. It shows the app name, a tagline, a Google sign-in button (delegated to a Client Component), and a terms-of-service note. It also preserves where the user was trying to go, so they land there after authentication.

## Why This Approach

Login pages are mostly static content — a heading, some text, a button. Making the page itself a Server Component means the static parts render instantly with zero JavaScript. Only the `LoginButton` (which needs to trigger a browser redirect to Google OAuth) is a Client Component.

The `redirect` query parameter is a standard pattern for post-login routing. If a user hits a protected route like `/billing`, the auth check redirects them to `/login?redirect=/billing`. After successful login, they end up at `/billing` instead of the default `/dashboard`.

## Code Walkthrough

```typescript
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const params = await searchParams;
  const redirectPath = params.redirect ?? '/dashboard';
```

Reads the optional `redirect` query param. Falls back to `/dashboard` if none is provided. This value gets passed to `LoginButton`, which includes it when initiating the OAuth flow (typically as part of the `state` parameter or a separate cookie).

The rest is straightforward centered-card layout with Tailwind utility classes. Nothing clever, nothing that needs to be.

## Complexity & Trade-offs

Minimal complexity. The only decision worth discussing is where to validate the `redirectPath`. This page trusts the value and passes it through. The actual redirect validation (preventing open redirects to external URLs) should happen server-side when the redirect is executed after auth. If you validated here, an attacker could still craft a direct POST to the auth endpoint with a malicious redirect.

## Patterns Worth Knowing

- **Post-login redirect preservation** — The `?redirect=` pattern. Protected route → login with redirect param → auth flow → land on original destination. Simple and stateless.
- **Server Component page + Client Component interactive bit** — Same pattern as the callback page. Static content renders server-side, interactive behavior lives in a leaf Client Component.

## Interview Questions

**Q: How do you prevent open redirect attacks with this pattern?**
A: The `redirectPath` value should be validated server-side before executing the redirect — typically by checking that it starts with `/` (relative path) and doesn't contain `//` (which browsers interpret as protocol-relative URLs). This validation belongs in the callback handler or API, not in the login page itself.

**Q: Why use an async Server Component for a page with no data fetching?**
A: `searchParams` is a `Promise` in Next.js 16, so you need `async/await` even though there's no database or API call. The "data fetch" here is just reading the URL — but the framework treats it as asynchronous to support Partial Prerendering.

## Data Structures

Just the search params:

```typescript
{ redirect?: string }
```

## Impress the Interviewer

The subtlety here is that this project uses Google OAuth exclusively — there's no email/password form. That's a product decision: small business owners (the target users) almost universally have Google accounts, and eliminating password management removes an entire class of security concerns (password storage, reset flows, credential stuffing). One button, one auth path, less code to maintain, fewer things to go wrong.
