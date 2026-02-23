# config.ts — Interview-Ready Documentation

## Elevator Pitch

Zod-validated environment config for the Next.js frontend. Instead of scattering `process.env.WHATEVER` across the codebase, this file validates all env vars at startup and exports a typed object. If a required var is missing, the app fails fast with a clear error instead of crashing later with `undefined`.

## Why This Approach

The project has a hard rule: no `process.env` in application code. All env access goes through validated config modules (this one for the web app, a similar one in the API). Zod schema validation gives you three things: type safety, default values, and fail-fast error messages.

## Code Walkthrough

- **`envSchema`**: Zod object with three fields. `API_INTERNAL_URL` defaults to `http://api:3001` (the Docker service name). `JWT_SECRET` is optional (not every context needs it). `NODE_ENV` is a strict enum with a default.
- **`webEnv`**: The parsed result. `envSchema.parse()` throws a `ZodError` at import time if validation fails. Since this is a module-level call, the app won't even start with bad config.

## Complexity & Trade-offs

Minimal complexity. The trade-off is indirection — you import `webEnv.API_INTERNAL_URL` instead of `process.env.API_INTERNAL_URL`. But that indirection buys you type checking, validation, and a single place to see every env var the frontend needs.

## Patterns Worth Knowing

- **Fail-fast config**: Parse env vars at module load time, not at first use. Catching a missing `JWT_SECRET` at startup is far better than catching it when the first user tries to log in.
- **Schema-as-documentation**: The Zod schema doubles as documentation for what env vars exist, their types, and their defaults. New developers read this file instead of grepping for `process.env`.

## Interview Questions

**Q: Why is `JWT_SECRET` optional?**
A: The web app doesn't always need the JWT secret. Server components that decode (not verify) JWTs use `decodeJwt` which doesn't need the secret. Only specific server-side operations need it, and they can check for its presence.

**Q: What happens if `API_INTERNAL_URL` is set to something that's not a URL?**
A: Zod's `.url()` validator rejects it at startup. The app crashes with a descriptive error like `Expected string matching URL format, received "not-a-url"`. You find out immediately, not when the first API proxy call fails.

## Data Structures

```typescript
// Validated env config
interface WebEnv {
  API_INTERNAL_URL: string;  // defaults to 'http://api:3001'
  JWT_SECRET?: string;
  NODE_ENV: 'development' | 'production' | 'test';
}
```

## Impress the Interviewer

Mention that this pattern is mirrored in the API (`apps/api/src/config.ts`) with a much larger schema. Consistency across the monorepo means every service handles config the same way. It's a small file, but it represents a codebase-wide discipline that prevents an entire category of bugs (undefined env vars at runtime).
