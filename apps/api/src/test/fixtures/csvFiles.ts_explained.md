# csvFiles.ts — Interview-Ready Documentation

## Elevator Pitch

A library of CSV string fixtures covering every edge case the upload pipeline might encounter — valid files, missing columns, bad dates, BOM markers, messy headers, partial failures. Tests import these instead of reading from disk, so the CSV validation logic gets exercised deterministically without any filesystem I/O.

## Why This Approach

You could load CSV files from a `__fixtures__/` directory, but string constants are simpler. No filesystem calls, no path resolution headaches, no accidentally committing a 50MB test file. Each constant has a name that describes the scenario it tests, which makes test assertions self-documenting. If someone adds a new validation rule to the CSV parser, they add a matching fixture here and a test that uses it.

The alternative — generating CSVs programmatically in each test — leads to duplicated setup code and makes it harder to see what's actually being tested.

## Code Walkthrough

Each export is a template literal containing raw CSV text:

- **`validCsv` / `validCsvWithOptionals`** — happy-path inputs. The parser should accept these without errors.
- **`missingColumn` / `invalidDates` / `invalidAmounts`** — column-level validation failures. Each targets a single rule so tests can assert specific error messages.
- **`emptyFile` / `headerOnly`** — boundary cases where there's technically "no data."
- **`bomPrefixed`** — the `\uFEFF` byte-order mark that Excel likes to prepend. Parsers that don't strip it will think the first column is named `\uFEFFdate` instead of `date`.
- **`messyHeaders`** — mixed case and extra whitespace. Tests that the header normalizer lowercases and trims before matching.
- **`trailingNewlines`** — trailing blank lines that naive parsers might treat as empty rows.
- **`partiallyValid` / `mostlyInvalid`** — mixed-validity rows. The upload pipeline does partial ingestion (skip bad rows, keep good ones) unless the failure rate exceeds a threshold.
- **`quotedHeaders`** — a comma inside a quoted field. This breaks `split(',')` and proves the parser handles RFC 4180 quoting.
- **`mixedCaseHeaders`** — similar to `messyHeaders` but without whitespace, isolating the case-normalization logic.

## Complexity & Trade-offs

This is intentionally low-complexity. The trade-off is maintenance — if the CSV schema changes (say, `amount` becomes `value`), you update every fixture by hand. That's acceptable for ~15 fixtures. At 50+ you'd want a builder function.

## Patterns Worth Knowing

**Test fixture modules** — a pattern where you co-locate test data in dedicated files rather than inlining it. Keeps test files focused on assertions. In an interview, you'd call this "separation of test data from test logic."

**Boundary value analysis** — the fixtures systematically cover: empty input, header-only, all-valid, all-invalid, partially valid, and format quirks (BOM, quoting, whitespace). That's not random — it maps to the boundary value testing technique.

## Interview Questions

**Q: Why string constants instead of reading CSV files from disk?**
A: No I/O in tests means faster execution and no path-resolution bugs across environments. The fixtures are small enough that inline strings are readable. You'd switch to file-based fixtures for large datasets or binary formats.

**Q: What's the BOM marker and why does it matter?**
A: The byte-order mark (`U+FEFF`) is a zero-width character that Windows applications (especially Excel) prepend to UTF-8 files. If your CSV parser doesn't strip it, the first column name will have an invisible prefix and header matching fails silently. The `bomPrefixed` fixture catches that regression.

**Q: How would you handle a scenario where the CSV schema evolves frequently?**
A: I'd introduce a builder — `buildCsv({ columns: [...], rows: [...] })` — so adding a new required column means changing the builder's defaults, not every fixture. But for a stable schema with ~15 fixtures, raw strings are fine.

## Data Structures

No complex types here. Each export is a `string` containing CSV text. The consuming tests pass these to the CSV parser, which returns parsed rows or validation errors depending on the fixture.

## Impress the Interviewer

The fixture set maps directly to a testing technique called equivalence partitioning. Valid input, each category of invalid input, and the boundary between them (partial validity) each get at least one fixture. When you talk about this in an interview, say: "I designed the fixtures around equivalence classes — each one targets a distinct failure mode so we get full coverage without combinatorial explosion." That shows you think about test design, not just test quantity.
