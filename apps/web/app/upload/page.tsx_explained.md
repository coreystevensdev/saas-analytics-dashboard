# UploadPage — Interview-Ready Documentation

## Elevator Pitch

The CSV upload page — where users bring their business data into the platform. It's another thin server component that renders `UploadDropzone`, the client component handling drag-and-drop file selection, validation, and upload progress.

## Why This Approach

Same page/component split as the rest of the app. No metadata export here (could be added), but the pattern stays consistent. The `UploadDropzone` handles all the interactive bits: file drag events, validation feedback, progress bars, error states.

## Code Walkthrough

- **Layout**: Constrained to 640px max width, centered with top padding. The narrow width keeps the upload area focused — you don't want a dropzone stretching across a 1440px monitor.
- **Heading**: "Upload Data" with `tracking-tight` for slightly tighter letter spacing. Small design touch.
- **`UploadDropzone`**: Client component that handles the drag-and-drop UX, file type validation (CSV only), size limits, and the actual upload POST through the BFF proxy.

## Complexity & Trade-offs

The page itself is trivial. The interesting decisions are in `UploadDropzone` — chunked uploads vs. single POST, progress tracking, error recovery. This page just sets the stage.

## Patterns Worth Knowing

- **Max-width constraint for form pages**: `max-w-[640px]` is a common pattern for pages with a single primary action. It prevents the UI from feeling sparse on wide screens.

## Interview Questions

**Q: Why is this page protected but the dashboard isn't?**
A: The dashboard shows pre-computed data (seed data for demo, user data after upload). Upload is a write operation that creates data in the database — it needs authentication. The proxy layer (`proxy.ts`) protects `/upload` but leaves `/dashboard` public.

**Q: Why delegate everything to UploadDropzone?**
A: File upload UX requires client-side APIs (drag events, File API, XMLHttpRequest or fetch for progress). None of that works in a server component. The page provides the layout; the component provides the interaction.

## Data Structures

No data structures in this file.

## Impress the Interviewer

If asked about this page, pivot to the upload architecture: the BFF proxy forwards the multipart form data to Express, which validates the CSV (column types, row limits, date parsing), stores it via Drizzle ORM, and invalidates the AI summary cache so the next dashboard visit triggers fresh analysis. The page is boring on purpose — the interesting stuff is behind it.
