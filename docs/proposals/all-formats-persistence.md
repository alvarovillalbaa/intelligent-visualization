# All-format persistence and publication

Last updated: 2026-11-06

The owner's All projects direction supersedes the earlier alternative-provider
proposal. Local persistence now targets PostgreSQL exclusively; hosted database
and object storage target Supabase/Vercel. No existing external deployment,
account or user data is migrated or deleted by source changes.

The current PostgreSQL candidate preserves Slides records and URLs through a
transactional legacy repository, alongside canonical visualization tables.
It also implements private Course/Report save/list/reopen and
revisions through `lib/workspace-drafts.ts` and `provider.workspaceDrafts` on local
PostgreSQL. Stable target/request UUIDs, fresh session/member roles, revision
checks and payload-bound atomic receipts preserve edits through retries/conflicts.
Revision zero creates a draft. Later saves use compare-and-swap; replaying a
receipt returns its original accepted revision/hash together with current state.
The client retains uncertain save intents and local edits, and requires reopening
when current and acknowledged revisions diverge. Apply changes the local editor;
Save Course/Report or Save revision persists explicitly.

The [local acceptance record](../results/2026/11-06/workspace-drafts-checks.md)
now verifies private Course and Report saving, revision-two edits, reload and
fresh-sign-in reopen on desktop and narrow profiles, with verified cleanup.
Those four browser journeys are accepted separately from the sixteen PostgreSQL
cases on attempt 2's source and eight HTTP/client cases on attempt 4's source;
there was no single 28-case invocation. Failed runs remain historical evidence.
This change leaves publication paths unchanged and provides no new public
Course/Report link. Future publication must compile the committed revision, retain
durable bytes and commit the version/pointer together; uncertain acknowledgements
must be reconciled before retry or cleanup.

Canonical and legacy identities are mapped with explicit legacy team/workspace/
actor namespaces, never merged by email. Authentication stays in the locked legacy
state; the adapter keeps authorization, canonical mutation and receipt on the same
database connection and transaction while holding the legacy row lock. Viewers
may read and admins/editors may save. Only team/workspace projections are created
for canonical foreign keys. Reads verify their ownership marker and team binding
without provisioning missing mappings; reserved identity collisions fail closed.
Saves require the browser Origin to match the explicitly configured
`NEXT_PUBLIC_APP_URL`; no request-host or forwarded-header fallback grants access.
Missing/invalid origin configuration fails closed. Private API responses use
`Cache-Control: private, no-store` and `Vary: Cookie`; summary lists do not contain
the document body, passwords or session data.

Rich slide source/editor/rendering must survive. Existing public URLs, private
access checks and artifact/event bindings need actual acceptance for every kind.
The canonical Slides compiler's placeholders cannot silently replace rich legacy
content. Hosted provider adapters must pass shared contract checks before being
advertised as supported.

The existing production environment metadata request was rejected with 403;
unchanged credentials are not retried or bypassed. Free capacity, database
isolation, grants, storage and host configuration remain separate gates. No
resource-sharing approval is inferred from another app's consolidation. No paid
plan, account, trial or provider mutation is proposed here. Hosted Supabase/Auth,
RLS, object storage, publication and the full AI/Eve flow remain pending. No
deployment is included; main and production remain held for reviewed configuration.

See [the PostgreSQL migration](../postgres-migration.md),
[provider architecture](../provider-architecture.md) and
[implementation order](../implementation-plan.md). Historical source/design and
verification receipts remain in Git; they are not current hosted acceptance.
