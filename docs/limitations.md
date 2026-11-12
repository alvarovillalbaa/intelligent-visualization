# Limitations

Last updated: 2026-11-12

This migration is not complete.

- Existing product routes still use legacy deck terminology.
- Supabase database/private Storage selection is implemented. Its v1 provider and disposable application packets are separate from the new lifecycle-v2 qualification; hosted production remains unverified.
- Report browser-draft grid authoring, standalone HTML export and local saved-revision publication are implemented; standalone download/print acceptance and hosted saving/publication remain unverified or unfinished.
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

Explicit local Course/Report publication now has separate
[focused acceptance](results/2026/11-06/workspace-publications-checks.md): live and
immutable anonymous readers, two saved revisions and preserved earlier bytes.
Hard deletion, public passwords, Course/Report embeds, canonical
analytics and original-asset delivery remain unfinished. Course completion is
browser-local per published version; quiz answers are not persisted. Publication
uncertainty retains its object and intent rather than deleting potentially
referenced data. Backups need database and object storage separately.

Local [Unpublish acceptance](results/2026/11-07/workspace-unpublications-checks.md)
now covers durable revocation, private edit preservation, backup/restore and later
republishing without reopening revoked version URLs. This stops subsequent reads;
already-open/history/downloaded copies cannot be recalled. Previously admitted
requests may finish, but no in-flight revocation race was executed. Hosted
revocation, physical devices/touch and a production cutover remain unverified.

Terminal [workspace removal](workspace-removal.md) is a separate candidate. It
retains the original parent/content/revision, revoked versions and linked history;
no storage object is deleted. A v2 migration and retirement of every old reader,
writer and backup tool are required before activation. Triggers do not revoke
old SELECTs or evict initialized pools. Portable v2 preserves tombstones present
in a backup/current target, but cannot recover later removals absent from both.
See [the focused check scope](proposals/workspace-removal-checks.md) for current
qualification; old provider/publication pass counts do not carry to changed v2 code.
