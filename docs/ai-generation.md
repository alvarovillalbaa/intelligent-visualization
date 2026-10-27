# AI Generation

The composer can request any nonempty combination of Slides, Course, and Report. It captures one source/style snapshot, then requests the selected formats sequentially. Each result has its own preview, error, and explicit retry. Retrying a failed or interrupted result uses the captured snapshot and retains the other results; Create again starts a new batch. The introductory page heading and paragraph appear only during source entry.

The primary `POST /api/visualizations/generate` accepts one `{kind, generationInput}` per call and requires an actual AI result. Missing configuration returns `503 / AI_UNAVAILABLE`; generation or invalid-output failures return `502 / AI_GENERATION_FAILED`. No heuristic draft is returned as a successful new generation. Strict calls configure `maxRetries: 0`; this does not establish a billing bound or cancel provider work after a browser timeout. No model, credentials, or provider configuration is changed by this repair.

The centralized model registry prefers AI Gateway when configured. Existing direct helper calls and the legacy streaming route retain their previous fallback behavior. Previously stored examples remain labelled as examples when restored; they do not count as newly generated AI drafts.

Guest batches use the existing four-hour browser storage key. Reload marks unfinished work interrupted and unacknowledged saves uncertain, without automatically making requests. All results and the captured retry input are retained together when storage is available. Invalid stored batches remain untouched until the user explicitly creates a new batch or starts over. Storage failures show a notice; a failed replacement preserves the previous copy. Compiled HTML is never persisted.

Slides with legacy source retain the rich legacy renderer inside the existing opaque sandbox and CSP. Restored canonical-only Slides can compile their canonical document instead; that renderer retains its existing image/chart limitations. Preview-only runtime uses in-memory poll state and makes no lead/analytics submissions. A preview compilation failure can be retried without generating again. Course and Report retain their existing React preview renderers. `POST /api/visualizations/artifact` accepts either a validated canonical `{document}` or the legacy `{deckSource}` and returns `{artifactHtml}`; this renders a preview without saving or publishing it. Published/default compiler runtimes retain their prior behavior.

Signed-in Slides retain their existing workspace save action and editor. A known acknowledgement displays its saved ID; an ambiguous response asks the user to check the workspace instead of repeating an unacknowledged create. Course and Report workspace persistence/publication still require the provider/service bridge described in [the persistence proposal](proposals/all-formats-persistence.md). Browser drafts and successful compilation are not durable account saves.

Verification boundaries are recorded in [the batch repair receipt](results/2026/10-27/generation-batches.md). The [mocked backend proposal](proposals/ai-generation-checks.md) is inactive until explicit approval. No real model call is covered by that proposal.

Remaining work:

- Staged source analysis, Layout x Style selection, plan generation, typed document generation, QA, bounded repair, and draft persistence for all visualization kinds.
- Complete durable workspace saving and publication for all kinds without losing existing Slides editing/rendering behavior.
