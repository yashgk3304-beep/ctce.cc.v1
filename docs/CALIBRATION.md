# Selector calibration loop

1. On a CodeTantra page, open Options and choose **Copy page-structure report**. The report contains tag names, IDs, class names, role/ARIA/data-attribute names, nesting/counts, editor engine, iframe layout, and hostname only. It deliberately excludes text, attribute values, URL path, and query string.
2. Inspect the JSON locally before sharing it. Remove any structure values that identify a student or course if the site encodes those in IDs/classes.
3. Provide the sanitized report and describe whether the page is a coding task, quiz, or other page. Never include solutions, hidden tests, account credentials, or API keys.
4. Tune only `src/content/selectors.config.ts`, add a hand-built fixture under `tests/fixtures/`, and add focused unit coverage. Do not add selectors that read hidden or non-visible content.
5. Run `npm run verify` and the fixture E2E checks, rebuild the release manifest, then manually compare the extracted question/editor/sample text with what is visibly rendered.

The timer and help widget are excluded from question extraction and signatures. A changed page structure is a calibration signal; it is not permission to guess or inspect hidden data.
