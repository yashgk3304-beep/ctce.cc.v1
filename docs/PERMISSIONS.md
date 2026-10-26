# Manifest permissions

The release manifest is generated from `src/shared/hostConfig.json`. The helper match includes only the configured loopback port; Chrome's documented match pattern syntax allows an explicit port.

| Entry | Reason |
|---|---|
| `storage` | Store user settings, the three Gemini API key slots and their cooldown status, consent, model list, daily count, and local suggestion cache. Keys are only read by Options and the service worker. |
| `scripting` | Required for the background worker to scan editor candidates and, only after the user presses an explicit panel action, run the editor adapter in the CodeTantra frame's MAIN world. It also reads editor buffers for local capture. |
| CodeTantra host | Inject the content script on configured practice hosts and allow visible DOM capture and the user-invoked editor picker. Quiz pages return inert before suggestion or page-report work. |
| Generative Language API host | Permit service-worker requests for model listing and suggestions, with the key in the `x-goog-api-key` header. |
| `http://127.0.0.1:47831/*` | Reach the local compile/run helper on its single configured port. The helper binds to loopback, checks Host/token, and refuses web Origins. |
`scripting` is required in the release manifest because writing and editor diagnosis use `chrome.scripting.executeScript`; execution is limited to tabs where the CodeTantra host permission applies. No code clicks Run, Submit, Next, or platform answer buttons. `tabs` is not declared. The background uses tab IDs supplied by content-script message senders and the extension command API to message the active tab. No permission is requested to read the active tab URL. No cookies, clipboard read, webRequest, downloads, `<all_urls>`, or network interception permission is requested. Clipboard copy uses a user-initiated clipboard write from the panel.

`minimum_chrome_version` is 116 for the supported MV3 implementation. Extension-page CSP is `script-src 'self'; object-src 'self'`. Test fixture host `http://127.0.0.1:4173/*` is present only when the dedicated test manifest build flag is used and is absent from a release manifest.

Docs checked: [Chrome match patterns](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns), [declare permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions), [manifest format](https://developer.chrome.com/docs/extensions/reference/manifest).
