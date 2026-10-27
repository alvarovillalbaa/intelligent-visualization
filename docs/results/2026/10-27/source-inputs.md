# Source inputs below the composer

Status: source implementation and focused checks complete; publication and hosted readback pending.

## Intent and scope

The [owning Notion page](https://app.notion.com/p/3b6a1ee8bd06808bb0bff40e0d6eb034), fetched on 2026-10-27, requests an input instead of the expandable textarea and each input appearing below it. The clean source baseline was [`199d71a351179a24845d810927b6dc69fe027c6a`](https://github.com/alvarovillalbaa/intelligent-visualization/commit/199d71a351179a24845d810927b6dc69fe027c6a).

The composer now uses the existing Input primitive with Add/Enter, removable text-source cards below it, explicit labels, and 44-pixel source controls. Enter is guarded during IME composition and autorepeat. Multiline paste preserves the clipboard text and the input's selection prefix/suffix in one added source. Continue commits pending text without changing the serialized context; generation still sends the original `rawText`/`files` transport shape. Existing URL/style, file-import, slide, Auth, provider, and generation paths are preserved.

Guest drafts keep their existing v2 key and four-hour expiry. Optional text-entry/pending metadata preserves entry boundaries in normal reloads; exact serialization must match canonical `rawText` before it is trusted. Legacy or mismatched metadata restores all canonical text as one source. Restored multiline pending content is promoted intact into a source card to avoid single-line input sanitization.

Independent review found and corrected a quota regression before publication: added metadata could cause file compaction even when the previous canonical text and full files would fit. The final fallback first drops duplicate metadata while keeping full file content/previews, then reaches the existing file-compaction path only if that smaller write also fails. The existing behavior when every storage write fails is unchanged.

## Checks

The 12 authored cases in [the unit source](../../../../tests/unit/source-inputs.test.ts) passed unchanged under Node 24.21.0 using a temporary assertion adapter: `describe`/`it` route to `node:test`; `toBe`, `toEqual`, `toHaveLength`, and absent-property checks route to strict Node assertions. Only the three client helper modules are permitted through the alias resolver; network calls throw. Results: 12 passed, zero failed/skipped/cancelled. No dependencies were installed. Both temporary adapter files were removed after an open-handle check returned none. Native Vitest, React rendering, browser gestures, real storage quota, model calls, and hosted provider behavior remain unverified.

These cases cover legacy CRLF/multiline text, exact whitespace, order and duplicates, pending text, empty pending delimiters, matching optional metadata, malformed/sparse/mismatched metadata, copied arrays, existing v2 storage, metadata-only quota pressure retaining full files, and true quota pressure reaching the existing compact-file fallback. They use authored text and in-memory storage only. Node emitted its existing typeless-package ESM detection warning; package configuration was not changed.

`git diff --check` and independent source review pass. The four changed TypeScript files parse with the existing TypeScript 5.9.3 parser, all 20 local imports resolve, and all 15 local links in the four changed Markdown documents resolve. These are static checks; no broad type compile was run. The last Storage Guard preflight reported 24.9 GiB free versus 34.0 GiB required; the source-only checkout is bounded at roughly 2 MB. No local dependency install, app build, development server, browser, database, provider setup, or CI was started.

## Hosting and remaining requirements

Read-only Vercel metadata identifies project `prj_HrrKVYcDrHajz290uNt7uTpU8DtA` in team `team_JpdIsOJgYNpX0ywVZ54Zdb7m`, Node 24.x, `iad1`. Before this change, production deployment `dpl_AzRtFd5VgJsDk4DPn9pTirLcWu51` was READY at the baseline SHA with canonical URL [intelligent-visualization.vercel.app](https://intelligent-visualization.vercel.app). That is prior-release metadata, not proof of the new input flow.

The current factories instantiate local persistence/storage; hosted provider choices remain unimplemented. Legacy direct Convex code does not establish shared provider-contract support. No provider, dependency, production configuration, Auth, schema, or CI change is included here.

The same Notion page separately requests multiple output-kind selection, second-screen title/description changes, combined login/register presentation, and AI-generated drafts. Those requirements remain open; this source-entry repair does not establish completion of the whole app or the wider all-project goal.
