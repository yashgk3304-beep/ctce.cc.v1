# Manual QA checklist

Run this on Windows 10/11 with Chrome Stable, Node LTS, and gcc installed. The first two checks can use the provided fixtures; CodeTantra and real Gemini checks require the student's own account/key and explicit consent.

- [ ] Install the unpacked release extension from `dist/` and open Options.
- [ ] Accept the consent notice, configure Primary and optional Backup keys, test each configured slot, load models, and save the Fast/Strong choices.
- [ ] Run `npm run helper:init`, save the token in Options, start `npm run helper`, and use **Test helper**.
- [ ] Open a fill-in-the-blank page with sample cases collapsed. Confirm the panel asks for manual expansion and does not open it.
- [ ] Expand the sample cases. Confirm they are captured and a proposal appears.
- [ ] Confirm partial editor capture shows `UNVERIFIED: PARTIAL EDITOR CAPTURE`; scroll to line 1 and confirm recapture.
- [ ] Confirm the visible sample result badge and tooltip state that hidden tests are not checked. Lenient-only matches must be called out.
- [ ] Press **Approve**, then enter a deliberate typo in CodeTantra by hand. Confirm Compare identifies the first mismatch.
- [ ] Navigate to another page and confirm the old suggestion is marked stale.
- [ ] Open a quiz page. Confirm there is no assistant panel, no snapshot report, and no Gemini request.
- [ ] On a plain textarea fixture, a Monaco playground, an Ace kitchen-sink page, and a CodeMirror demo, explicitly click **Write to editor**, verify read-back, then use **Restore previous**.
- [ ] On CodeTantra, test complete program, fill-in-the-blank, and debugging answers. Verify the fill-in-the-blank preserves every nonblank character.
- [ ] On a multiple-answer question, explicitly click **Select answers** and confirm only proposed options are selected. Confirm no platform Run/Submit/Next/answer button was clicked.
- [ ] Use **Pick code box** on a page with multiple candidates; confirm highlights, Escape cancellation, and hostname selector reuse.
- [ ] Use **Diagnose editor** and copy the JSON report. Confirm scanning itself did not change the page.
- [ ] In Ask Anything, confirm the preview contains only the typed question until **Read screen** is clicked; send only after reviewing the preview.
- [ ] Confirm the extension never automates Run, Submit, Next, or any platform answer button.
- [ ] For fallback, use an invalid Primary key and valid Backup 1 key; confirm Backup 1 is shown as the responding slot. Reset status after correcting the Primary key.
- [ ] Review **Show exactly what was sent to Gemini** and confirm the preview is redacted and excludes URL/account header text.

Record the Chrome version, CodeTantra hostname (not the full URL), editor engine, and any failed step. Never put API keys or student identifiers into a QA report.
