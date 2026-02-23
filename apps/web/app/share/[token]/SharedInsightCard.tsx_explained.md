# SharedInsightCard.tsx — Interview-Ready Documentation

## Elevator Pitch

This is the public-facing card that displays a shared AI business insight. It shows the organization name, a date range, the full AI-generated summary text, and a call-to-action button that drives visitors to sign up. It's the viral acquisition component — when someone shares an insight link, this is what the recipient sees.

## Why This Approach

The shared insight card is a conversion-optimized landing experience disguised as a content card. The recipient sees a real AI-generated business insight (not a screenshot, not a marketing blurb), then gets a clear CTA to try the product themselves. The card needs to look polished, read well on mobile, and load instantly — so it's a Server Component with zero JavaScript.

The `SummaryText` helper splits the AI output into paragraphs. AI-generated text comes back as a single string with `\n\n` paragraph separators. The helper turns those into properly spaced `<p>` tags with typographic styling (line-height, font-size, paragraph spacing).

## Code Walkthrough

### SummaryText

```typescript
function SummaryText({ text }: { text: string }) {
  const paragraphs = text.split('\n\n').filter(Boolean);

  return (
    <div className="max-w-prose text-base leading-[1.6] md:text-[17px] md:leading-[1.8] [&>p+p]:mt-[1.5em]">
      {paragraphs.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  );
}
```

`max-w-prose` caps the line length at ~65 characters — the optimal reading width. The responsive font sizing (`text-base` on mobile, `17px` on desktop) and generous line height (`1.6` / `1.8`) make long AI-generated text comfortable to read. The `[&>p+p]:mt-[1.5em]` selector adds spacing between consecutive paragraphs using the adjacent sibling combinator.

Using `index` as the key is fine here — the paragraphs are static (server-rendered from a fixed string), never reorder, and never get added/removed. React's warning about keys is about dynamic lists where items change; this is a static mapping.

### SharedInsightCard

```typescript
<article className="w-full max-w-2xl motion-reduce:duration-0">
  <div className="rounded-lg border border-border border-l-4 border-l-primary bg-card p-6 shadow-md md:p-8">
```

The `border-l-4 border-l-primary` gives the card a colored left accent bar — a visual cue that this is a highlighted/special piece of content. `article` is the correct semantic element for a self-contained piece of content that could be syndicated independently.

```typescript
<Link
  href="/login"
  className="inline-flex h-12 w-full items-center justify-center rounded-lg bg-primary px-6 text-base font-medium text-primary-foreground ..."
>
  Get insights like these for your business — Free to start
</Link>
```

The CTA is a full-width button on mobile (`w-full`), constrained-width on desktop (`md:w-auto md:min-w-[320px]`). The copy is specific ("Get insights like these for your business") rather than generic ("Sign up"). It links to `/login`, which starts the Google OAuth flow. "Free to start" addresses the cost objection upfront.

## Complexity & Trade-offs

Low complexity with one notable trade-off: the `SummaryText` component is duplicated. A similar paragraph-splitting component exists in `AiSummaryCard.tsx` (the in-app version). The project notes flag this as tech debt — extract at third use. Two instances is tolerable; three means it's time to consolidate.

The card doesn't include any charts or visualizations from the original insight. That's intentional — the shareable link is about the AI-generated text, not the raw data. Including charts would require serializing chart config, rendering them client-side (requiring JS), and potentially exposing business data. The text-only approach is simpler, faster, and more shareable (it works in link previews, screen readers, email).

## Patterns Worth Knowing

- **Conversion-focused component design** — The card's layout guides the eye: org name (credibility) → date range (context) → summary (value) → CTA (action). This is a landing page pattern applied at the component level.
- **`max-w-prose` for readability** — Tailwind's prose width constraint prevents lines from getting too long on wide screens. Long lines are hard to read because the eye has to travel too far to find the start of the next line.
- **Semantic HTML (`article`)** — Screen readers and search engines understand that this is a self-contained content unit. The `header` element inside groups the title and date.
- **Adjacent sibling selector in Tailwind** — `[&>p+p]:mt-[1.5em]` targets "a `p` that directly follows another `p` inside this element." Cleaner than adding a margin class to every paragraph or using `space-y-*` (which would also affect non-paragraph children).

## Interview Questions

**Q: Why use `article` instead of `div` for the card?**
A: `article` is a sectioning content element that represents a self-contained composition. A shared insight qualifies — it has a title, content, and makes sense independently of the page around it. Screen readers can list all `article` elements on a page, and search engines treat them as distinct content units. It's a small semantic choice, but it shows you think about HTML meaning, not just visual presentation.

**Q: The `SummaryText` component uses array index as key. When is that okay?**
A: When the list is static — items don't get reordered, added, or removed between renders. Here, the AI summary text is a prop that never changes (it's server-rendered from a database value). React uses keys to track which items changed during re-renders. If nothing re-renders, the keys don't matter. Using a hash of the text as a key would be more "correct" but adds computation for no benefit.

**Q: How would you add social share meta tags for this card?**
A: The parent page (`page.tsx`) already handles this via `generateMetadata`. It fetches the share data and returns OpenGraph metadata (title, description). When someone pastes the share URL into Slack or Twitter, those platforms read the OG tags and render a preview card. The metadata is generated on the server, so it's available to crawlers without JavaScript.

## Data Structures

```typescript
interface SharedInsightCardProps {
  orgName: string;        // e.g., "Acme Coffee Co."
  dateRange: string;      // e.g., "Jan 2026 — Mar 2026"
  aiSummaryContent: string; // multi-paragraph AI-generated text with \n\n separators
}
```

The props come directly from the API response, filtered through the parent page. No transformation needed.

## Impress the Interviewer

This component is the end of the viral acquisition loop. The flow: user gets AI insight → shares it via ShareMenu → recipient opens link → sees this card → clicks CTA → signs up → gets their own insights → shares them. The card bridges an existing user's value and a new user's first impression. Design details like the accent bar, the readable typography, and the specific CTA copy all serve that conversion goal. The component doubles as a growth mechanism rendered as React.
