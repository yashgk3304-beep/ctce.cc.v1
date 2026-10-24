# Assumptions and calibration points

Date: 2026-10-24

- The requested host was still the placeholder, so the configured match is `https://*.codetantra.com/*`. Change only `src/shared/hostConfig.json` if the institution uses another domain, then rebuild.
- No real CodeTantra DOM snapshot was supplied. The selectors in `src/content/selectors.config.ts` are cautious heuristics backed by hand-built fixtures, not a stable CodeTantra contract.
- Quiz URLs/headings use conservative signals. A false quiz classification should stay inert; a false coding classification still does not send content until consent and automatic suggestions are enabled.
- The editor adapters can only determine completeness from rendered DOM line numbers. Hidden buffer content is not accessed unless a user separately grants Chrome's optional `scripting` permission.
- The active file name, visible line range, whitespace glyphs, and sample input/output parsing depend on page markup and need calibration with sanitized structure reports.
- CodeTantra judge whitespace rules and transcript echo behavior are unknown. The verifier reports each comparison mode and warns when only a lenient mode passes.
- gcc uses `gnu11`, `-Wall -Wextra -O0`, and MinGW's ANSI stdio compatibility define by default. These flags are configurable only through documented settings/code, and are not claimed to match the judge.
- The helper memory limit is best effort on Windows using PowerShell process working set polling. Non-Windows runs have no memory guard.
- `Alt+Shift+C` is the configured panel shortcut; Chrome allows users to edit extension shortcuts at `chrome://extensions/shortcuts` if it conflicts with a local binding.
- Auto-suggest is gated by first-run consent and the Options setting. The extension never clicks or writes to the CodeTantra page.

## Current known gaps

- Real-page selector calibration and end-to-end verification require a sanitized CodeTantra diagnostics export.
- Native helper behavior requires Windows with gcc on PATH; this workspace does not currently expose gcc.
- An optional main-world editor read is present, but Chrome's permission grant UI and user gesture flow should be validated in a real Chrome session before relying on it.
