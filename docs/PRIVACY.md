# Privacy and data flow

## Before consent

The Options page displays the consent notice and no automatic Gemini suggestion is allowed until the student accepts it. The content script reads only visible structure and editor text from a page that the probe identifies as a coding page. Quiz pages exit before observers, snapshots, or page reports are started. The extension does not read cookies, browser storage belonging to the page, tokens, network traffic, hidden tests, or answer keys.

## Suggestion request

The content script sends a snapshot to the extension service worker. The worker redacts email addresses, phone numbers, and ID-like strings from the question, editor, and sample fields. Only these fields and a type hint are sent to Google's Gemini API. The URL, URL path/query, account name, email in the header, avatar, and other page chrome are excluded. The API key is held in `chrome.storage.local`, is never included in a content-script message, and is sent as the `x-goog-api-key` request header.

The Options page has a **Show exactly what was sent to Gemini** panel action. It displays the redacted request fields retained for the current suggestion. The consent page links the current Gemini API Terms and notes that data use differs between free and paid usage. The user should review Google's terms for their service tier before accepting.

## Local verification

When configured, the extension sends proposed C source and visible sample inputs/expected outputs to the local helper at `127.0.0.1` only. The helper validates its token and request shape, statically blocks process-launch and network APIs, compiles in a fresh temporary directory, runs each visible sample with time/output limits, then removes the directory. It does not send source or results to a remote service.

## Stored locally

The API key, helper token, consent flag, settings, request counter, and redacted or generated suggestion cache live in extension local storage. Cache entries are bounded to 200 and expire after seven days. Logs are off by default, local, and must not contain keys or page text beyond hashes. There is no analytics, telemetry, remote config, or remote code.

## Limitations and key handling

Redaction is pattern-based and cannot guarantee detection of every institution-specific identifier. Review the displayed request before use. Restrict a Gemini key to the Generative Language API and set quota/budget alerts in Google AI Studio or Google Cloud. Do not publish the key or the helper's 64-character token. `.env`, helper token files, build output, and logs are ignored; a pre-commit hook scans staged files for known secret forms.

Flow summary: visible page → content-script extraction → local redaction → background cache/Gemini request → schema validation → local gcc helper using visible samples → panel review. Model output cannot trigger browser actions. The only generated C executed is screened and run locally after user settings allow verification.
