# Multi-format generation repair

Status: source published; existing automatic CI and production delivery passed. Focused mocked backend/browser acceptance remains pending. This receipt covers the current repair and does not establish end-to-end provider readiness.

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

The prepared [54-case acceptance proposal](../../../../docs/proposals/batch-checks.md) selects 26 frontend cases, those 22 mocked backend cases, and six anonymous desktop/mobile Chromium scenarios. Its workflow and browser source are inactive examples; neither is installed in discovery. The earlier four source-input browser scenarios remain separately inactive. No new permission is inferred from automatic CI or another application's approval.

Source release [`71e676c98e2542fd031114e8194236276c1608f8`](https://github.com/alvarovillalbaa/intelligent-visualization/commit/71e676c98e2542fd031114e8194236276c1608f8) reached Vercel `READY` as `dpl_Gt94J2Hgq6w4cMwVz3Y6wH7vyt2T`. The unchanged automatic [CI run 40551649320](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/40551649320/job/122356700654) passed setup/doctor/lint, then stopped on `TS2352` in the deliberately invalid-kind test cast. All test/provider/export/build steps were skipped. The correction casts through `unknown` before the intentionally invalid array; no assertion is removed or weakened. A successful host deployment alone is not a passing repository typecheck or test run.

Corrected source [`7ac237d29cdaeeff19294d27dbf60cc6ccd60782`](https://github.com/alvarovillalbaa/intelligent-visualization/commit/7ac237d29cdaeeff19294d27dbf60cc6ccd60782) passed the unchanged automatic [CI run 40551946257 / job 122357746199](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/40551946257/job/122357746199) on Node 22.23.3 and Vitest 4.1.9. Setup, doctor, lint, typecheck, all **58 tests across nine files**, local-provider rerun, export, verification, and build passed. The 58 include all fourteen new batch cases and twelve source-input cases. The separate provider step repeats the same three local-provider tests; it does not establish 61 distinct cases or any hosted adapter.

Vercel `dpl_7zjuqEynns9gDgKXnhFoJcTKKLSi` was read back `READY` at the corrected SHA with the canonical alias. A connected HTTP fetch of [the root page](https://intelligent-visualization.vercel.app/) returned 200, included the source input and original first-screen introduction, and identified that exact deployment. No browser interaction or Create action was executed. Documentation/proposal-only follow-ups do not change these checked product/test bytes; their source and hosted status must be recorded separately.

No local install, production model call, account operation, migration, database mutation, provider reconfiguration, or all-kind publication occurred for this repair. Production resource checks were read-only metadata. Local builds remain blocked by the Storage Guard reserve.

## Remaining acceptance

Course/Report workspace persistence, publication, event handling, and provider contract proof remain open; see [the resource/service proposal](../../../../docs/proposals/all-formats-persistence.md). Current browser previews are not substitutes for those capabilities. Mocked checks cannot prove real-model quality, provider connectivity, authenticated saves, public-page parity, or mobile physical-device behavior.
