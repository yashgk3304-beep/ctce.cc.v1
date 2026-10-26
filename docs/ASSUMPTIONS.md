# Assumptions and calibration points

Date: 2026-10-25

- The requested host was still the placeholder, so the configured match is `https://*.codetantra.com/*`. Change only `src/shared/hostConfig.json` if the institution uses another domain, then rebuild.
- No real CodeTantra DOM snapshot was supplied. The selectors in `src/content/selectors.config.ts` are cautious heuristics backed by hand-built fixtures, not a stable CodeTantra contract.
- Quiz URLs/headings use conservative signals. A false quiz classification should stay inert; a false coding classification still does not send content until consent and automatic suggestions are enabled.
- The editor adapters inspect only visible, eligible editor candidates in CodeTantra frames. MAIN-world scanning uses the required `scripting` permission; it does not inspect hidden tests or platform storage.
- The active file name, visible line range, whitespace glyphs, and sample input/output parsing depend on page markup and need calibration with sanitized structure reports.
- CodeTantra judge whitespace rules and transcript echo behavior are unknown. The verifier reports each comparison mode and warns when only a lenient mode passes.
- gcc uses `gnu11`, `-Wall -Wextra -O0`, and MinGW's ANSI stdio compatibility define by default. These flags are configurable only through documented settings/code, and are not claimed to match the judge.
- The helper memory limit is best effort on Windows using PowerShell process working set polling. Non-Windows runs have no memory guard.
- `Alt+Shift+C` is the configured panel shortcut; Chrome allows users to edit extension shortcuts at `chrome://extensions/shortcuts` if it conflicts with a local binding.
- Auto-suggest is gated by first-run consent and the Options setting. Code edits require a trusted click on **Write to editor**; platform controls remain manual.

## Current known gaps

- Real-page selector calibration and end-to-end verification require a sanitized CodeTantra diagnostics export.
- Native helper behavior requires Windows with gcc on PATH; this workspace does not currently expose gcc.
- Editor APIs vary by CodeTantra deployment. The writer re-detects candidates at write time and verifies read-back; unsupported or read-only editors leave the Copy path available. Real CodeTantra iframes should be included in manual QA.
- A saved editor selector is keyed by page hostname. If a hostname has multiple frames with the same selector, the focused candidate or largest visible candidate is used after the selector match.
- Fill-in-blank writes require explicit blank fragments or recognizable underscores/comment placeholders/legacy line edits. An empty, isolated editable region is treated as one blank; other page-specific editable regions may need a future selector adapter.
- The actual model selection lives in the user's Chrome `storage.local`, which is not part of this source checkout; confirm it in Options before reporting live model performance.
