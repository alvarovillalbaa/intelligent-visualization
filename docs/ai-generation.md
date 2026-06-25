# AI Generation

Current status:

- AI credentials are optional.
- Missing AI configuration falls back to deterministic heuristic deck generation.
- Legacy deck generation now uses AI SDK 6 `generateText` and `streamText` with `Output.object`.
- A centralized model registry prefers AI Gateway when configured.

Remaining work:

- Staged source analysis, Layout x Style selection, plan generation, typed document generation, QA, bounded repair, and draft persistence for all visualization kinds.
- Replace deck-only prompts with visualization-kind-specific schemas.
