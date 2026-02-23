# formatters.ts — Interview-Ready Documentation

## Elevator Pitch

Two pre-configured `Intl.DateTimeFormat` instances shared across the admin UI. Instead of calling `new Date().toLocaleDateString()` with options scattered in every component, you create the formatter once and reuse it.

## Why This Approach

`Intl.DateTimeFormat` is expensive to construct — it parses locale data, resolves options, and builds internal state. Creating it once at module scope and reusing it is the standard optimization. The alternative (formatting inline with `toLocaleDateString`) re-creates that internal machinery on every call, which matters when you're rendering a table with hundreds of rows.

Passing `undefined` as the locale means "use the browser's locale." The admin sees dates in their own format (US gets "Apr 9, 2026", Germany gets "9. Apr. 2026") without any i18n library.

## Code Walkthrough

`dateFmt` — date only, `"medium"` style (e.g., "Apr 9, 2026"). Used in the org and user tables for `createdAt` columns.

`dateTimeFmt` — date plus time, `"medium"` date and `"short"` time (e.g., "Apr 9, 2026, 2:30 PM"). Used in the analytics events table where timestamps matter more.

## Complexity & Trade-offs

Minimal. The trade-off is that these formatters are created at module load time, which means they capture the locale at import time. In a server-rendered context (RSC), the locale is the server's locale, not the user's. For this admin panel that's fine — it's a client component context, and admin users are internal.

## Patterns Worth Knowing

- **Singleton formatters**: Create `Intl.*` objects once, call `.format()` many times. Same pattern works for `Intl.NumberFormat`, `Intl.RelativeTimeFormat`, etc.

## Interview Questions

**Q: Why not use a library like date-fns or dayjs?**
A: `Intl.DateTimeFormat` is built into every modern browser and Node.js. For simple date display, adding a library is unnecessary weight. You'd reach for date-fns when you need relative time ("3 days ago"), duration math, or timezone manipulation — none of which apply here.

**Q: What happens if you pass an invalid date string to `.format()`?**
A: `new Date("invalid")` returns `Invalid Date`, and `Intl.DateTimeFormat.format(Invalid Date)` returns the string `"Invalid Date"`. The API validates dates before sending them, so this is a non-issue in practice, but it won't throw.

## Data Structures

No complex structures. Two `Intl.DateTimeFormat` instances exported as named constants.

## Impress the Interviewer

Point out that `Intl.DateTimeFormat` does locale-aware formatting without any dependencies — it handles month names, day ordering (month/day vs day/month), and even calendar systems (Gregorian, Islamic, etc.) natively. Most developers reach for a library without checking if the platform already handles their use case.
