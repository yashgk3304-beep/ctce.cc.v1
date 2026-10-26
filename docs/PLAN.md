# CT-C Assistant — Plan

Date: 2026-10-24

## Goal

Manifest V3 Chrome extension that reads visible CodeTantra coding pages (question, editor, samples), classifies, asks Gemini for a proposal, verifies locally with gcc, and shows a review panel. Writing is available only after an explicit user action, followed by read-back verification; Run/Submit/Next are never automated.

## Assumptions (unknown facts → configurable)

- CodeTantra host: `*.codetantra.com` (placeholder; single config: `src/shared/hostConfig.ts`).
- DOM selectors, editor engine, quiz markers, judge compare mode, gcc flags/C standard: all configurable; recorded in `docs/ASSUMPTIONS.md`.

## Stack choice

| Piece | Choice | Why |
|-------|--------|-----|
| Bundler | **Vite 6** | Multi-entry (background / content / options), TypeScript, Vitest-friendly, no CDN; simpler Chrome MV3 multi-bundle than raw esbuild glue. |
| UI | Plain TypeScript + Shadow DOM | Zero UI framework dependency; CSP-safe `textContent` rendering. |
| Tests | Vitest + Playwright + node:test | Spec requirement. |
| Helper | Node `helper/server.mjs` | Zero npm deps at runtime. |
| Schemas | zod | Local re-validation of model JSON. |
| LLM | `@google/genai` behind `LlmProvider`; REST fetch fallback if worker bundle fails | Official SDK per ai.google.dev. |

## Layout

```
src/background/   Gemini, queue, cache, helper client, router
src/content/      probe, extractors, heuristics, tracker, frames, selectors.config.ts
src/content/panel/ Shadow-DOM UI
src/injected/     MAIN-world editor readers and explicit user-invoked writer adapters
src/shared/       types, schemas, normalize, redact, hash, errorMap, hostConfig
src/options/      options page
helper/           local compile-and-run
tests/, tools/, docs/
```

## Milestones

1. **M1** scaffold, manifest generator, build, Options, forbidden-API test  
2. **M2** probe, extractors, signature, frames, diagnostics, fixtures  
3. **M3** classifier (stage 1 + 2)  
4. **M4** Gemini provider, schemas, queue, cache, error map  
5. **M5** helper, verification, repair loop  
6. **M6** panel, Approve, Compare, Check my code  
7. **M7** e2e + spy tests, CI, docs  

## Cut order (if needed)

iframe support → API-read opt-in → `-O2` UB check → side-panel option. Never cut §1, §9, §12, or tests.

## Network for docs

Internet available. Package versions and doc URLs go in `docs/VERIFIED.md`.
