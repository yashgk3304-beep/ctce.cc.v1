# API and package verification

Checked 2026-10-24 against official documentation. The package versions below are pinned exactly in `package.json`; a lockfile and install/build verification are still required before a release.

| Area | Package / API | Version or use | Official reference |
|---|---|---|---|
| Chrome MV3 | Manifest, service worker, match patterns, host permissions, storage | minimum Chrome 116; explicit port supported in match patterns | [Manifest](https://developer.chrome.com/docs/extensions/reference/manifest), [match patterns](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns), [permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions), [storage](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies) |
| Gemini | `@google/genai` | `2.31.0`; `GoogleGenAI`, `models.list()`, `models.generateContent()`, structured output with `responseMimeType` / `responseSchema`; request retries and timeouts configured through `httpOptions` | [JavaScript SDK](https://ai.google.dev/gemini-api/docs/quickstart?lang=node), [structured output](https://ai.google.dev/gemini-api/docs/structured-output), [models API](https://ai.google.dev/api/models), [API reference/auth header](https://ai.google.dev/api) |
| Gemini REST | Generative Language API | `v1beta`, `generateContent`, `x-goog-api-key` header; list-model pagination via `nextPageToken` | [API reference](https://ai.google.dev/api), [models](https://ai.google.dev/api/models) |
| Vite | `vite` | `6.4.1` | [Build](https://vite.dev/guide/build) |
| Vitest | `vitest` | `3.2.4` | [Getting started](https://vitest.dev/guide/) |
| Playwright | `playwright`, `@playwright/test` | `1.56.1`; extensions require persistent Chromium context; test docs recommend bundled Chromium | [Chrome extensions](https://playwright.dev/docs/chrome-extensions) |
| ESLint | `eslint` | `9.39.1` flat config | [Configuration](https://eslint.org/docs/latest/use/configure/configuration-files) |
| TypeScript | `typescript` | `5.9.3`, strict mode | [TSConfig](https://www.typescriptlang.org/tsconfig/) |

The Gemini JavaScript SDK is the documented package name. The provider retains the REST fallback for listing models and uses the SDK's single `generateContent` path for suggestions to avoid repeating failed generation requests. The client is reused for the lifetime of the extension service worker; generation uses a 60-second per-attempt timeout and at most two HTTP attempts. Streaming is not yet implemented by the current provider; it returns a single generated response. Playwright's current extension guide recommends persistent context and its bundled Chromium, not branded Google Chrome. A CI and local environment must still run `npm ci --ignore-scripts`, lint, tests, and build to verify the installed package graph and bundling.
