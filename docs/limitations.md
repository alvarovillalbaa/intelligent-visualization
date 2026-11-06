# Limitations

Last updated: 2026-11-06

This migration is not complete.

- Existing product routes still use legacy deck terminology.
- Supabase provider is not implemented.
- Report browser-draft grid authoring and standalone HTML export are implemented; browser/download/print acceptance and hosted saving/publication remain unverified or unfinished.
- Course browser-draft authoring and its separately recorded download/file checks are implemented; hosted Course saving/publication and learner analytics remain unfinished.
- AI SDK deprecated object APIs still exist in `lib/ai/generate-deck.ts`.
- Eve, Workflows, Sandbox QA, and Queues are not implemented.
- Focused disposable Playwright/CI scopes are recorded separately; full-product browser coverage remains incomplete.

The PostgreSQL provider and transactional legacy repository replace the previous
database paths in this candidate. Their focused migration acceptance is recorded
in [the migration receipt](results/2026/11-06/postgres-checks.md). Current production remains on its earlier source until a hosted
database/storage configuration is reviewed. The JSONB legacy bridge serializes
slide operations. Private Course/Report saving now explicitly maps legacy
team/workspace/actor namespaces without merging accounts. Its focused
save/reopen acceptance is recorded separately from the migration in the
[draft receipt](results/2026/11-06/workspace-drafts-checks.md). Database exports do not
include media/artifact objects. Private saving does not establish publication,
hosted access/storage or automatic guest-draft transfer.
