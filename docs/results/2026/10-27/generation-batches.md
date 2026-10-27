# Multi-format generation repair

Status: source under review; publication and runtime acceptance pending. This receipt covers the current repair and does not establish end-to-end provider readiness.

The [owning Notion QA](https://app.notion.com/p/3b6a1ee8bd06808bb0bff40e0d6eb034), fetched on 2026-10-27, asks to remove the second-screen introduction, select multiple formats from the same sources, and use real AI rather than predefined drafts. The user explicitly confirmed the second-screen/multi-format interpretation. A signed reference-image navigation was blocked by the browser; the image was not viewed. No alternative interpretation of that image is claimed.

Baseline: [`d0cfb6ca29dab9c80a53fbe08cd0593dfe6b786e`](https://github.com/alvarovillalbaa/intelligent-visualization/commit/d0cfb6ca29dab9c80a53fbe08cd0593dfe6b786e). The earlier [source-input repair](source-inputs.md) and [account presentation](account-presentation.md) have separate receipts.

## Product changes

- Guest and workspace introductions appear only at source entry. Existing first-screen heading/copy is retained.
- Any nonempty selection of Slides, Course, and Report creates stable ordered results from one deep-cloned input. Requests are sequential and synchronously guarded against duplicate clicks. Partial failure retains successes; explicit retries use the original input.
- Primary generation requires actual AI. Safe 400/502/503 responses replace heuristic success in that endpoint. Existing helper defaults and the legacy streaming route retain their prior behavior. Provider/model selection, prompts, credentials, dependencies, Auth policy, and CI configuration are unchanged.
- Guest storage retains all results, removes compiled HTML, restores in-flight requests as interrupted, and restores unacknowledged saves as uncertain. No recovery request runs automatically. Invalid stored batches are protected from automatic overwrite; failed writes retain the previous copy.
- Slides retain their rich renderer and existing workspace save/editor path. Preview-only runtime works without local storage or lead/analytics submissions. Course and Report retain their React previews. Save acknowledgement is separate from generation success, and a missing acknowledgement cannot trigger a blind duplicate save.

## Verification boundary

Fourteen frontend state/storage regression cases are authored in `tests/unit/generation-batch.test.ts`; the twelve source-input cases are unchanged. Local native execution is unavailable because this checkout has no dependencies and Storage Guard blocks installation. No different-version dependency substitution was used.

Node 24.21.0 and the existing TypeScript 5.9.3 parser accepted sixteen changed/new TypeScript sources, including the inactive mocked test source; 93 local imports and 17 Markdown file targets resolved. This is syntax/import/link proof, not a TypeScript program compile or execution. Independent source review found two recovery bugs: a valid canonical-only Slides draft could not recompile after reload, and a file import could repopulate the composer after Start over. The repair now prefers rich legacy source with a canonical-document fallback, and invalidates late imports on reset/unmount while retaining simultaneous imports within the same source session. The workspace heading also retains its original first-screen spacing.

Twenty-two backend/renderer assertions remain outside discovery in [the inactive proposal](../../../../docs/proposals/ai-generation-checks.md), pending explicit backend-test approval. Browser checks and temporary CI also require explicit approval under the supplied AGENTS.md §§7 and 14. Exact native CI and publication outcomes will be recorded separately.

No local install, production model call, account operation, migration, database mutation, provider reconfiguration, or all-kind publication occurred for this repair. Production resource checks were read-only metadata. Local builds remain blocked by the Storage Guard reserve.

## Remaining acceptance

Course/Report workspace persistence, publication, event handling, and provider contract proof remain open; see [the resource/service proposal](../../../../docs/proposals/all-formats-persistence.md). Current browser previews are not substitutes for those capabilities. Mocked checks cannot prove real-model quality, provider connectivity, authenticated saves, public-page parity, or mobile physical-device behavior.
