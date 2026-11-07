# Complete the hosted Supabase boundary

Prepared 7 November 2026 from accepted local candidate
`f69782ca81517b733dafa566212876621b35f0d5`. This is a source-grounded next
implementation proposal, not hosted support or acceptance. No account, project,
role, settings, migration, installation or runtime was changed by this review.
Standing approval covers necessary implementation and bounded checks; no new
approval is requested. Free capacity and existing environment access remain gates.

## Current gaps

- [The Supabase package](../../packages/provider-supabase/index.ts) is a status
  stub. [Persistence selection](../../lib/persistence/factory.ts) fails closed.
- [Local database creation](../../packages/provider-local/database.ts) deliberately
  accepts loopback only and initializes the local schema. Keep that boundary.
  Hosted requests need separate connection, migration and runtime-role policies.
- [The legacy repository](../../lib/repository.ts) directly uses local legacy
  state, including sign-in, sessions and Slides. Merely changing canonical
  provider selection would split authentication and application data across databases.
- [Canonical storage](../../lib/storage/factory.ts) and
  [legacy storage](../../lib/storage.ts) have independent filesystem paths. Both
  need durable hosted coverage. Private canonical objects must stay behind the
  committed `/v/` gate; a public bucket would bypass Unpublish.
- [Current Supabase intent](../supabase.md) explicitly keeps portable auth as the
  default; native Supabase Auth/Storage/Realtime are optional integrations.
  `AUTH_PROVIDER` metadata alone does not implement native Auth or tenant RLS.

## Dependency-ready implementation

1. Extract the necessary PostgreSQL repository/transaction primitives into a
   shared provider core with an injected database, trusted schema identifier and
   initialization policy. Keep existing local URL validation, schema lineage and
   local behavior. Do not relabel a remotely configured local provider as Supabase.
   Preserve versioned local migrations; hosted migrations have explicit ownership
   and version lineage rather than silently rewriting existing schema versions.
2. Implement the Supabase PostgreSQL adapter using the existing locked native
   driver if suitable. Give it a private schema, explicit migration command,
   runtime migration-version checks and a least-privileged server role. Requests
   must not create tables, initialize an unknown namespace or seed demo credentials.
   Hosted initialization must create empty application state or perform an explicit
   verified import. Validate TLS, transaction-pooler and connection lifecycle
   assumptions against the actual selected service before claiming support.
3. Route legacy repository operations, portable sign-in/session ownership and
   workspace authorization through that exact selected database. Preserve current
   identities, password/session rules and fresh membership checks; no account
   merging by email. Keep the legacy all-tenant JSON row server-private: browser
   anon/authenticated Data API roles must not read or write it. Do not advertise
   native Supabase Auth or user-level RLS without its own mapping/policy acceptance.
4. Implement private hosted `StorageAdapter` behavior and adapt both canonical and
   legacy writes/readers. Preserve exclusive immutable creation, detached input
   bytes, actual readback/hash checks and retained uncertain objects. Inventory
   Slides/public-media/original-file references before changing legacy reader
   policy; canonical storage alone is insufficient for a Vercel cutover. Original
   uploads, artifact versions and public delivery need explicit ownership rules.
5. Author shared provider contracts and actual disposable Supabase-service checks
   for canonical transactions, legacy/auth selection, role/Data API denial,
   explicit setup/migrations, portable backup/restore and private storage. Verify
   the full Course/Report publish/revoke path and preserved Slides behavior on the
   new provider, not merely selector or mocked SDK responses. Then verify an
   existing free hosted target and Vercel deployment with reviewed secrets/config.
   The previous environment403 is not retried without an actual access change.

Using native PostgreSQL transactions is an implementation candidate, not proof of
Supabase deployment compatibility. Follow the official
[connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres).
If choosing the Data API instead, atomic multi-step commands require server-side
transaction functions and explicit privileges, not sequential SDK CRUD; see
[database functions](https://supabase.com/docs/guides/database/functions) and
[RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).
A service credential bypassing RLS does not establish application-user isolation.

## Delivery limits

Finalize source/contract scope before mutation and verification activation. Do not
make the selector usable until its adapter, legacy/auth bridge and shared contract
checks pass. Separate local disposable-service evidence from actual hosted Auth,
pooler, TLS, storage, email and production proof. Tests touching the refactored
runtime may need new regression execution; older receipts keep their old sources.
Keep CI changes bounded and temporary, preserve permanent CI and all failures,
and use no model calls or paid/new-account workaround. Host Storage Guard remains
below reserve, so no local installation/build/server/browser/database is allowed.
No production cutover or whole-product completion is implied by this proposal.
