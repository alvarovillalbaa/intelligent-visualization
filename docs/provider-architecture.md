# Provider architecture

Last updated: 2026-11-07

`PERSISTENCE_PROVIDER=local` selects standard PostgreSQL using the explicit
loopback `LOCAL_DATABASE_URL`. Only local PostgreSQL is implemented; the reserved
`supabase` boundary fails closed pending an adapter and shared contract checks.
Other database provider selectors, SDKs and deployment stubs are removed.

`packages/backend-contracts/provider.ts` owns canonical persistence commands.
Provider SDKs belong inside provider packages or migration tools/tests. Queries
are parameterized and qualified under `intelligent_visualization_local`; commands
use transactions, idempotency/resource locks and expected-revision checks.

The legacy slide repository uses the same PostgreSQL connection/schema boundary
with an independently shaped JSONB state row. Loaded operations are scoped to
one locked transaction. Existing slide routes and permissions stay compatible;
there is no request-time demo initialization or process-memory fallback. The demo
store remains only as an explicit fixture.

Private Course/Report save, list and reopen are implemented through
`lib/workspace-drafts.ts` and `provider.workspaceDrafts`, with DTOs in
`packages/backend-contracts/workspace-drafts.ts`. The local implementation receives
the adapter's exact database and canonical provider instance. It initializes the
schema before locking legacy state, then checks the current session expiry,
user/member roles, membership and workspace ownership inside that same transaction
and connection. Viewers may read; admins and editors may save. Canonical CRUD
primitives alone are not the application authorization boundary.

The mapping uses `legacy-team:`, `legacy-workspace:` and `legacy-user:` identities.
Only team/workspace projections are created on an explicit save; no canonical
user/session is created, credentials are not copied and accounts are not merged
by email. Reads do not provision projections. Reads and existing saves verify the
exact team bridge marker and
workspace/team binding, refusing to adopt unrelated records occupying reserved
identities. Course/Report summaries are scoped to the mapped team/workspace and
paginated by timestamp and ID; the full document is returned only on an authorized
detail read or save.

A stable draft UUID and a separate request UUID identify each save intent.
Revision zero creates the draft; later writes compare the expected revision.
The atomic receipt binds actor, team, workspace, draft, request and normalized
payload. Reusing a request with different content is rejected. Replays authorize
again and return the original receipt alongside current canonical state, so a
previous success does not authorize overwriting a newer revision. The client
validates acknowledgement identities, document hashes and revisions, retains
uncertain edits, and requires explicit reload when revisions diverge.

The private API returns `Cache-Control: private, no-store` and `Vary: Cookie`.
Save bodies are bounded JSON with strict request fields. Their raw Origin must
match the explicitly configured root HTTP(S) `NEXT_PUBLIC_APP_URL`; request URLs,
forwarded headers and loopback aliases are not alternate trust sources. Missing
or invalid configuration fails closed. Apply updates local editor state; explicit
Save persists it. Saving alone does not publish artifacts or add public links.

Local private Course/Report browser acceptance now covers desktop and narrow
profiles saving, editing revision two, reloading and reopening after fresh sign-in,
with verified cleanup. The [acceptance record](results/2026/11-06/workspace-drafts-checks.md)
keeps those four journeys separate from the sixteen PostgreSQL cases on attempt 2's
source and eight HTTP/client cases on attempt 4's source; these were not one
28-case invocation. Hosted Supabase/Auth/RLS, hosted object storage/publication and the
full AI/Eve flow remain separate gates. No deployment is included.

Explicit Course/Report publication now uses `provider.workspacePublications` and
`lib/workspace-publications.ts`. Prepare and commit each reauthorize under the
legacy lock. Existing receipt rows bind globally reserved request/version UUIDs,
actor, workspace, draft revision/hash and original live pointer; a stale draft or
pointer conflicts. Version, live pointer and final receipt commit atomically.
The separate storage step retains a single exclusive envelope with the original
HTML/manifest/binding/hash/CSP; recovery validates that object without recompiling.
Only committed owned versions resolve publicly. Uncertain put/commit outcomes
never cause automatic object deletion. See [the local flow](workspace-publication.md)
and [its focused receipt](results/2026/11-06/workspace-publications-checks.md).

`workspacePublications.unpublish` freshly authorizes an expected current version
and atomically commits all-version `revoked` eligibility, draft record status and
a payload-bound receipt. It retains the last pointer, working document and
version/object contents. Prepared publish receipts now compare original status
as well as pointer; old PREPARED receipts missing status become durable conflicts,
while old FINAL receipts replay normally. A retained revoked pointer is accepted
for new publishing only on a verified canonical draft. Generic rollback rejects
revoked targets and the canonical workspace Course/Report namespace; legacy
Slides rollback remains. Existing TEXT status columns and portable v1 carry the
eligibility change without a schema migration. See [the Unpublish receipt](results/2026/11-07/workspace-unpublications-checks.md).

Storage selection remains independent. `auto` selects local filesystem for local
persistence and the reserved Supabase storage boundary for Supabase. Explicit
`vercel-blob` and `supabase` storage are recognized but unimplemented and fail
closed. The local filesystem implements exclusive immutable creation, and the
local publication service verifies durable readback. This does not establish
hosted storage/access or a production cutover. See [the migration](postgres-migration.md).
