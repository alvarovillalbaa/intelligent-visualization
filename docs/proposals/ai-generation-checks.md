# Inactive strict AI generation and artifact checks

This is source only. No backend tests, server, model calls, dependency installation, or CI activation were performed. The supplied AGENTS.md §7 requires explicit approval before executing backend checks. BeforeLaunch approval and earlier source-input browser proposals do not authorize these checks.

The [inactive test source](ai-generation.test.ts.example) is outside test/build discovery. After approval, an owner can copy it into a focused test directory and run only that file with the repository's existing Vitest dependencies. The future run must mock `ai`, the model registry, source-context fetching, and brand application before importing handlers. It must use no real credentials, provider endpoints, database, account, or storage adapter.

The proposed assertions cover:

- Primary generation for slides, courses and reports: missing configuration returns safe `503 / AI_UNAVAILABLE`; provider or unusable-output failures return safe `502 / AI_GENERATION_FAILED`; no heuristic success is substituted.
- Successful mocked model output preserves `{kind, document, deckSource, artifactHtml, provider, modelName, generatedAt}`. Strict calls specify `maxRetries: 0`; this bounds SDK retry configuration, not provider billing or end-to-end cost.
- Malformed JSON and unsupported kinds return safe `400 / INVALID_GENERATION_INPUT` before model resolution. Provider messages and stacks are not returned.
- Existing direct helper calls keep their default missing-configuration fallbacks; course/report legacy model-failure fallback remains unchanged. The legacy streaming generation route is outside this change.
- Artifact `POST {document}` validates the canonical document and compiles all three kinds to `{artifactHtml}` with `preview: true`. Invalid or ambiguous payloads return `400 / INVALID_ARTIFACT_INPUT`. The legacy `{deckSource}` payload keeps its rich renderer and response shape, with its new opt-in preview runtime.
- Canonical published/default compiler HTML remains unchanged when preview is absent or false. Preview runtime uses in-memory course completion and visible quiz feedback without analytics, network methods, or local-storage dependence. Its manifest identifies preview behavior.
- Legacy Slides published/default HTML also stays unchanged. The primary AI route and legacy artifact endpoint opt into preview mode: keyboard navigation and local poll selection remain interactive, while lead capture is explicitly preview-only and no visitor storage or analytics/lead requests execute.

Mocked success is not real-model quality, connectivity, schema reliability, browser interaction, hosted acceptance, or published rendering parity. Canonical Slides still use the existing compiler's image/chart placeholders; the rich legacy Slides preview remains separate. Real AI calls, rendering/browser acceptance, authenticated all-kind saving and publication require their own explicit scope and evidence.

API transport remains one requested kind per generation call. Multi-output orchestration belongs to the client; this change does not create atomic cross-kind generation or persistence. Compile responses do not save documents, upload files, create public URLs, or publish analytics records. Preview iframe CSP/sandbox remains the frontend owner's responsibility.
