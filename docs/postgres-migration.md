# PostgreSQL migration

The owner's [All projects brief](https://app.notion.com/p/3b6a1ee8bd06803e99d1cf6b0218c207)
requires PostgreSQL for local persistence and removal of alternative database
providers. The returned Notion snapshot was edited 15 October 2026. This source
implements the local database and slide-repository part of that brief; hosted
Supabase/storage and the full AI/Eve suite remain unfinished.

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
operations and is intended for the current small workspace; canonical Course and
Report saving/publication still need application-service integration. Canonical
and legacy identity records are not silently merged. Files written during an
operation remain outside SQL compensation; a failed/uncertain commit can leave
an orphan file and must not trigger broad deletion.

The obsolete provider SDKs, deployment stubs and selectors are removed from active
source. Historical receipts and generic vendored model-selector catalog entries
are retained; they do not enable a database provider. No old live deployment was
deleted or migrated.

This release is isolated on a work branch. Local Storage Guard reported 29.8 GiB
free against 34.0 GiB required, so installs, databases, server/browser checks and
builds must run only in the approved disposable CI scope. Keep existing production
on its prior source until a reviewed hosted database/storage configuration exists.
