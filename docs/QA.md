# Manual QA checklist

Run this on Windows 10/11 with Chrome Stable, Node LTS, and gcc installed. The first two checks can use the provided fixtures; CodeTantra and real Gemini checks require the student's own account/key and explicit consent.

- [ ] Install the unpacked release extension from `dist/` and open Options.
- [ ] Accept the consent notice, enter a Gemini key, load models, and save the Fast/Strong choices.
- [ ] Run `npm run helper:init`, save the token in Options, start `npm run helper`, and use **Test helper**.
- [ ] Open a fill-in-the-blank page with sample cases collapsed. Confirm the panel asks for manual expansion and does not open it.
- [ ] Expand the sample cases. Confirm they are captured and a proposal appears.
- [ ] Confirm partial editor capture shows `UNVERIFIED: PARTIAL EDITOR CAPTURE`; scroll to line 1 and confirm recapture.
- [ ] Confirm the visible sample result badge and tooltip state that hidden tests are not checked. Lenient-only matches must be called out.
- [ ] Press **Approve**, then enter a deliberate typo in CodeTantra by hand. Confirm Compare identifies the first mismatch.
- [ ] Navigate to another page and confirm the old suggestion is marked stale.
- [ ] Open a quiz page. Confirm there is no assistant panel, no snapshot report, and no Gemini request.
- [ ] Verify that the extension never edits the page or activates CodeTantra controls; only interact with extension panel controls.
- [ ] Review **Show exactly what was sent to Gemini** and confirm the preview is redacted and excludes URL/account header text.

Record the Chrome version, CodeTantra hostname (not the full URL), editor engine, and any failed step. Never put API keys or student identifiers into a QA report.
