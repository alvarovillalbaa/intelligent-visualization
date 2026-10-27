# Limitations

This migration is not complete.

- Existing product routes still use legacy deck terminology.
- `lib/repository.ts` still imports Convex directly.
- Convex provider-contract adapter is not implemented.
- Supabase provider is not implemented.
- Cloudflare Worker + D1 provider is only a skeleton.
- Report editor grid is not implemented.
- Course browser-draft authoring is implemented; hosted Course saving/publication and browser interaction acceptance remain unverified.
- AI SDK deprecated object APIs still exist in `lib/ai/generate-deck.ts`.
- Eve, Workflows, Sandbox QA, and Queues are not implemented.
- Playwright and GitHub Actions are not fully wired.

The local SQLite provider, local storage adapter, artifact compiler, setup script, and first tests are executable.
