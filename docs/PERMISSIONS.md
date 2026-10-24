# Manifest permissions

The release manifest is generated from `src/shared/hostConfig.json`. The helper match includes only the configured loopback port; Chrome's documented match pattern syntax allows an explicit port.

| Entry | Reason |
|---|---|
| `storage` | Store user settings, consent, model list, daily count, and local suggestion cache. The Gemini key is only read by extension pages and the service worker. |
| Optional `scripting` | Explicitly optional full editor text getter in the page's MAIN world, only after the user grants this permission. Without it, the extension uses visible rendered lines and reports partial captures. |
| CodeTantra host | Inject the read-only content script on configured practice hosts and allow local DOM capture. Quiz detection returns inert before content is reported. |
| Generative Language API host | Permit service-worker requests for model listing and suggestions, with the key in the `x-goog-api-key` header. |
| `http://127.0.0.1:47831/*` | Reach the local compile/run helper on its single configured port. The helper binds to loopback, checks Host/token, and refuses web Origins. |
| `scripting` optional permission | Needed for `chrome.scripting.executeScript` only; not requested at install time. |

`tabs` is not declared. The background uses tab IDs supplied by content-script message senders and the extension command API to message the active tab. No permission is requested to read the active tab URL. No cookies, clipboard read/write, webRequest, downloads, `<all_urls>`, or network interception permission is requested. Clipboard copy uses a user-initiated clipboard write from the panel; Chrome permission behavior should be verified in the target Chrome version.

`minimum_chrome_version` is 116 for the supported MV3 implementation. Extension-page CSP is `script-src 'self'; object-src 'self'`. Test fixture host `http://127.0.0.1:4173/*` is present only when the dedicated test manifest build flag is used and is absent from a release manifest.

Docs checked: [Chrome match patterns](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns), [declare permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions), [manifest format](https://developer.chrome.com/docs/extensions/reference/manifest).
