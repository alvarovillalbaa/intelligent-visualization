# Limitations

Last updated: 2026-11-06

This migration is not complete.

- Existing product routes still use legacy deck terminology.
- Supabase provider is not implemented.
- Report browser-draft grid authoring and standalone HTML export are implemented; browser/download/print acceptance and hosted saving/publication remain unverified or unfinished.
- Course browser-draft authoring is implemented; hosted Course saving/publication and browser interaction acceptance remain unverified.
- AI SDK deprecated object APIs still exist in `lib/ai/generate-deck.ts`.
- Eve, Workflows, Sandbox QA, and Queues are not implemented.
- Playwright and GitHub Actions are not fully wired.

The PostgreSQL provider and transactional legacy repository replace the previous
database paths in this candidate. Their focused acceptance must pass before
publication. Current production remains on its earlier source until a hosted
database/storage configuration is reviewed. The JSONB legacy bridge serializes
slide operations. The next Course/Report saving candidate explicitly maps legacy
team/workspace/actor namespaces without merging accounts; its focused runtime
acceptance is pending. Database exports do not include media/artifact objects.
