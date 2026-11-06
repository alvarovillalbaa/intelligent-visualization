# Provider architecture

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
store remains only as an explicit fixture. Canonical all-format identity/service
integration is still separate work.

Storage selection remains independent. `auto` selects local filesystem for local
persistence and the reserved Supabase storage boundary for Supabase. Explicit
`vercel-blob` and `supabase` storage are recognized but unimplemented and fail
closed. Local PostgreSQL does not establish hosted storage/access or durable
artifact publication. See [the migration](postgres-migration.md).
