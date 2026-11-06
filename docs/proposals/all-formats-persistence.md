# All-format persistence and publication

Last updated: 2026-11-06

The owner's All projects direction supersedes the earlier alternative-provider
proposal. Local persistence now targets PostgreSQL exclusively; hosted database
and object storage target Supabase/Vercel. No existing external deployment,
account or user data is migrated or deleted by source changes.

The current PostgreSQL candidate preserves Slides records and URLs through a
transactional legacy repository, alongside canonical visualization tables.
The next candidate implements private Course/Report save/list/reopen and revisions
through an authenticated service. Stable target/request identities, verified live
session/workspace roles, revision checks and payload-bound atomic receipts preserve
edits through retries/conflicts. [Focused checks](workspace-draft-checks.md) remain
pending until their actual run. Publication must compile the committed
revision, retain durable bytes and commit the version/pointer together; uncertain
acknowledgements must be reconciled before retry or cleanup.

Canonical and legacy identities are mapped with explicit legacy team/workspace/
actor namespaces, never merged by email. Authentication stays in the locked legacy
state; only team/workspace projections are created for canonical foreign keys.
Rich slide source/editor/rendering must survive. Existing public URLs, private
access checks and artifact/event bindings need actual acceptance for every kind.
The canonical Slides compiler's placeholders cannot silently replace rich legacy
content. Hosted provider adapters must pass shared contract checks before being
advertised as supported.

The existing production environment metadata request was rejected with 403;
unchanged credentials are not retried or bypassed. Free capacity, database
isolation, grants, storage and host configuration remain separate gates. No
resource-sharing approval is inferred from another app's consolidation. No paid
plan, account, trial or provider mutation is proposed here.

See [the PostgreSQL migration](../postgres-migration.md),
[provider architecture](../provider-architecture.md) and
[implementation order](../implementation-plan.md). Historical source/design and
verification receipts remain in Git; they are not current hosted acceptance.
