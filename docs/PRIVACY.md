# Privacy and data flow

## Before consent

The Options page displays the consent notice and no automatic Gemini suggestion is allowed until the student accepts it. The content script reads only visible structure and editor text from a page that the probe identifies as a coding page. Quiz pages exit before observers, snapshots, or page reports are started. The extension does not read cookies, browser storage belonging to the page, tokens, network traffic, hidden tests, or answer keys.

## Suggestion request

The content script sends a visible-page snapshot to the extension service worker. The worker redacts email addresses, phone numbers, and ID-like strings from the question, editor, and sample fields. Only these fields and a type hint are sent to Google's Gemini API for suggestions. The URL, URL path/query, account name, email in the header, avatar, and other page chrome are excluded. The three API key slots are held in `chrome.storage.local`, are never included in a content-script message, and are sent as the `x-goog-api-key` request header by the service worker.

**Ask Anything** sends the question text the user types. It does not include page context unless the user presses **Read screen** for that message. The panel displays the redacted JSON payload preview before the user presses **Ask**; the message is cleared after the request so screen context is not carried into the next message.

The Options page has a **Show exactly what was sent to Gemini** panel action. It displays the redacted request fields retained for the current suggestion. The consent page links the current Gemini API Terms and notes that data use differs between free and paid usage. The user should review Google's terms for their service tier before accepting.

## Local verification

When configured, the extension sends proposed C source and visible sample inputs/expected outputs to the local helper at `127.0.0.1` only. The helper validates its token and request shape, statically blocks process-launch and network APIs, compiles in a fresh temporary directory, runs each visible sample with time/output limits, then removes the directory. It does not send source or results to a remote service.

## Stored locally

The three API keys, per-slot invalid/quota/cooldown status, helper token, consent flag, settings, request counter, and redacted or generated suggestion cache live in extension local storage. Options displays only whether a key is configured and its last four characters; it never reads a saved key back into the page. Cache entries are bounded to 200 and expire after seven days. When Local debug logs are enabled, the extension keeps at most 100 timing-only performance records in extension local storage. These contain model IDs, selected slot, token counts, retry counts, stage durations, and safe error codes, but no page text, source code, sample data, URLs, or credentials. There is no analytics, telemetry, remote config, or remote code.

## Limitations and key handling

Redaction is pattern-based and cannot guarantee detection of every institution-specific identifier. Review the displayed request before use. Restrict a Gemini key to the Generative Language API and set quota/budget alerts in Google AI Studio or Google Cloud. Do not publish the key or the helper's 64-character token. When **Local debug logs** is enabled, timing records include stage duration, selected model ID, API-reported token counts when available, bounded retry counts, and safe error codes. They do not include prompt text, source code, sample inputs/outputs, URLs, API keys, or helper tokens. Logs are off by default and remain local. `.env`, helper token files, build output, and logs are ignored; a pre-commit hook scans staged files for known secret forms.

Flow summary: visible page → content-script extraction → local redaction → background cache/Gemini request → schema validation → local gcc helper using visible samples → panel review. A separate explicit **Write to editor** action runs an adapter in the page's MAIN world, then reads the editor back and reports whether it matches. **Restore previous** is also explicit. MCQ selection only sets the proposed checkboxes/radio state after a separate user click. The extension never clicks Run, Submit, Next, or a platform answer button. Model output cannot trigger browser actions. The only generated C executed is screened and run locally after user settings allow verification.
