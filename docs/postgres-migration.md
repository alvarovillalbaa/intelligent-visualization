# PostgreSQL migration

Last updated: 2026-11-06

The owner's [All projects brief](https://app.notion.com/p/3b6a1ee8bd06803e99d1cf6b0218c207)
requires PostgreSQL for local persistence and removal of alternative database
providers. The returned Notion snapshot was edited 15 October 2026. This source
implements the local database, slide repository and private Course/Report draft
application service and explicit saved-revision Course/Report publication.
Hosted Supabase/Auth/RLS/storage/publication and the full AI/Eve suite remain
unfinished.

## New installations

Use Node 22 or later, a local PostgreSQL server and the configured filesystem
storage. The optional Compose file binds PostgreSQL 17.6 to loopback port 54431,
using an application-owned persistent volume. Starting/stopping that service is
an operator action; source development did not run Docker or create local data.

Copy `.env.example` to `.env.local`, configure `LOCAL_DATABASE_URL`, start your
local database and run `npm run setup:local`. Setup applies versioned schema
initialization and explicitly seeds the demo, preserving an existing seed.
Requests never seed a missing repository. `npm run doctor` checks actual database
and storage reachability without printing database URLs or passwords.

Set `NEXT_PUBLIC_APP_URL` to the root HTTP(S) address actually used in the browser,
including its port. Private draft saves require the raw browser Origin to match
that configured origin exactly. Credentials, path prefixes, queries and fragments
are not accepted in this setting. Missing/invalid configuration fails closed;
request-host or forwarded headers do not supply a fallback.

## Existing installations

Old database files, storage directories and external deployments are untouched.
There is no automatic file-database conversion, external-provider cutover or
silent adoption of an unversioned namespace. Use the old source version's export
before upgrading, verify the backup and retain originals. Import compatible
portable v1 database records into a fresh PostgreSQL destination. The old reset
command now stops with instructions; it deletes no database, schema or files.

Portable database export uses a new exclusive owner-only directory and validated
counts/checksums. Import checks the complete whitelist and inserts atomically:
identical rows are no-ops, conflicting rows abort the whole import, unrelated rows
remain. Authentication hashes and legacy business bearer links are private backup
data, flagged in the manifest. Active sessions and idempotency records are omitted.
After restoring, establish a new session and reopen saved drafts; an old pending
save cannot rely on an omitted request receipt.

Media/artifact objects are not copied: back up `LOCAL_STORAGE_DIR` and legacy
`.slides-storage` separately. Export/import is not a complete hosted cutover.

## Persistence and compatibility

Canonical tables use native JSONB/timestamptz and retain textual domain IDs.
Every relation is qualified under `intelligent_visualization_local`. Schema
initialization is transactional and locked; unknown versions and unversioned
existing tables are rejected. Idempotency, revision checks and publication use
real transactions and resource locks. Failed transaction work is not cached as
a successful idempotency result.

Legacy slide operations preserve their existing record shapes in a locked JSONB
row. Each request gets an instance closure, so concurrent processes cannot lose
updates through a shared mutable in-memory state. This bridge serializes legacy
operations and is intended for the current small workspace. Private Course/Report
save/list/reopen now uses an application service over canonical visualization
tables. It rechecks the live session, membership, role and workspace while holding
the legacy lock through the canonical operation on the adapter's same connection.
Viewers can read; admins/editors can save. Explicit `legacy-team:`,
`legacy-workspace:` and `legacy-user:` identities avoid email-based account merging
or copying legacy credentials/sessions into canonical tables. Only team/workspace
projections are created on save, and their ownership markers/bindings are verified before use;
reads never provision them.

Each Course/Report save uses a stable draft UUID, a separate request UUID and an
expected revision. The payload-bound receipt commits with the document. A replay
reauthorizes access and returns both its original accepted revision/hash and
current state. Conflicts and uncertain acknowledgements preserve local edits;
they do not authorize replacing a newer revision. Applying an edit remains local
until an explicit save. This reuses existing tables without a new schema migration.
The separate [publication flow](workspace-publication.md) now adds explicit
saved-revision publication, anonymous live/version readers and verified immutable
local artifact storage without a new schema migration. Existing slide readers
remain separate; the raw-file route rejects the reserved canonical namespace.
The
[local acceptance record](results/2026/11-06/workspace-drafts-checks.md) verifies
private Course/Report saving, revision-two edits, reload and fresh-sign-in reopen
on desktop and narrow browser profiles, including cleanup. Its four browser
journeys are separate from the sixteen PostgreSQL cases on attempt 2's source and
eight HTTP/client cases on attempt 4's source; no single 28-case invocation is
claimed. The [publication receipt](results/2026/11-06/workspace-publications-checks.md)
records its distinct forty core and four browser identities across three sources.
Hosted Supabase/Auth/RLS/storage/publication and full AI remain pending.

Files written during a legacy operation remain outside SQL compensation;
a failed/uncertain commit can leave an orphan file and must not trigger broad deletion.

The obsolete provider SDKs, deployment stubs and selectors are removed from active
source. Historical receipts and generic vendored model-selector catalog entries
are retained; they do not enable a database provider. No old live deployment was
deleted or migrated.

This release is isolated on a work branch. The Course/Report work's recorded
Storage Guard result was 20.6 GiB free against 34.0 GiB required, so installs,
databases, server/browser checks and builds must run only in the approved
disposable CI scope. Keep existing production
on its prior source until a reviewed hosted database/storage configuration exists.
