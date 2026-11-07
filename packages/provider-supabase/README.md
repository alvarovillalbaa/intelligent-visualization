# Supabase Provider

This package owns hosted connection policy, private schema validation and the
private Storage REST adapter. Provider-neutral SQL and transactions live in
`../provider-postgres`; the local adapter keeps its loopback-only connection and
original migration lineage. Application code uses provider contracts.

Status: the [90-case disposable-service packet](../../docs/results/2026/11-07/supabase-provider-attempt-8.json)
passed at its recorded source. Real application selection is now implemented;
its separate TLS/browser checks remain pending. This is **not accepted hosted
support**. No hosted project, production configuration or production database
has been changed. Concurrent Supabase initialization is shared, only healthy
instances are cached, and a failed persistence candidate closes its owned pool.

The server uses portable application authentication and a dedicated `iv_runtime`
database login. It does not implement Supabase Auth or browser tenant policies.
The private schema rejects browser `anon` and `authenticated` access. Its RLS
policies authorize the server role; application services enforce user membership.
Requests validate an installed schema and never run migration DDL or seed users.

The migration filename in `supabase/migrations` came from the actual pinned CLI
probe documented in [its receipt](../../docs/results/2026/11-07/supabase-cli-source-probe.md).
Its populated SQL ran only in owned disposable stacks. Provision hosted credentials
outside source control, apply migrations under an explicit migration owner, then
enable LOGIN and set a private password on the newly created runtime role.
Existing schemas or runtime roles are refused without adopting or changing them.
Use the dedicated runtime login for application requests. A configured private
bucket is also required; the adapter never creates or makes a bucket public.

`SUPABASE_DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and
`SUPABASE_STORAGE_BUCKET` are server-only configuration. Database URLs require
verified TLS and the dedicated login, with no query-string overrides. Pooler
connections use unnamed queries and one owned connection per transaction.

Storage uses exclusive uploads, actual byte/hash readback and private reads.
Canonical publication objects remain behind `/v/`; legacy objects use the
`legacy-slides/` physical prefix. `/files/` requires fresh ownership metadata or
an unprotected committed attachment snapshot. Original generation inputs stay
private. Older versions without a snapshot gain no inferred public file access.

Portable data commands now accept `--provider local` or `--provider supabase`
using the same selected schema. Backups contain authentication hashes and bearer
links, omit sessions, and currently **do not include object bytes**. Hosted import
may replace only the migration's exact empty legacy row, inside the import
transaction; it refuses conflicting user data. A database-only parity check is
insufficient for a storage or production cutover.
