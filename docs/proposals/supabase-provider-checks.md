# Disposable Supabase policy diagnostic packet

Prepared 7 November 2026. This inactive packet executes no local host runtime and
does not enable the Supabase selector. Review and pin the candidate source before
creating `qa/supabase-provider-20261107-3`; the permanent workflow is untouched.

Attempt one at `5babe6dc068669a1f5d970cb22b9d0953d4ae818` failed semantic
TypeScript checking before CLI setup or any test. Preserve its
[failed receipt](../results/2026/11-07/supabase-provider-attempt-1.json), 188,095
bytes, SHA-256
`a99c0f71ff7dd1c5df2cd06e1cab1485f58fbdd54e249480db5ab1f9c98944b6`.
Attempt two at `5ae8aa3c2f69ad98894375d7f212355c0117c9da` passed 28 affected
local PostgreSQL cases, failed all 13 Supabase shared cases during fixture health,
and did not run the remaining 48 cases. Preserve its
[failed receipt](../results/2026/11-07/supabase-provider-attempt-2.json), 323,072
bytes, SHA-256
`dd03c3c755b7a1f1b62fe62366596b447ee0632e8db306053c58c9bd87c651ae`.
Both failures remain failures. This packet pins both identities, carries zero
cases and requires every prior exported input to remain byte-identical.

The generic policy error conceals its failing predicate. A PostgreSQL 17 automatic
creator ADMIN membership is a source-grounded hypothesis, not an observed cause.
Collect actual metadata before choosing a correction. The existing migration,
runtime validator and membership policy are unchanged.

One public Ubuntu 24.04 job uses Node 24.21.0 and the checksum-pinned Supabase CLI
3.0.0 archive already verified by the source probe. All app source exports,
dependencies, CLI files, HOME/config/cache/temp files and reports live inside an
exclusive controller-owned `/tmp/ivsb-*` directory. Source/index/symlink guards
check the original checkout five times, and exported inputs retain their hashes.
The existing lock is frozen; installation uses `npm ci --ignore-scripts`.

This is diagnostics only, with zero test invocations. Repeated lint, semantic type
checking, test collection, Vitest, the separate regression PostgreSQL service,
builds and browsers are omitted. No previously failed case is rerun or accepted.
After fresh setup, one actual runtime LOGIN makes a read-only catalog transaction:
current/session identity and role flags, directional memberships with grantor and
ADMIN/INHERIT/SET options, namespace/table owners and ACLs, RLS flags/privileges,
browser schema privileges, policies, migration lineage and legacy row keys only.
No application payload, user/session data or catalog password is selected.

Then one actual `provider.health()` call runs with the same runtime LOGIN and
unchanged injected-database validator as the failed fixtures. Its success/error
is observed; it does not gate provider acceptance. The internal injection is
explicit diagnostic context, not application factory/TLS/hosted proof.

The actual disposable CLI stack keeps PostgreSQL, Auth, Storage, Kong and
PostgREST. Other services are disabled/excluded. CLI help is read before each
command family; the generated TOML is converted to the supported JSON shape and
removed, leaving one unambiguous owned configuration. Exact project/workdir labels,
running DB/Kong containers and their host-port bindings are verified before any
administrative database or bucket mutation. The CLI-generated migration
filename is preserved; explicit setup then gives its fresh restricted runtime
role LOGIN and an authored disposable password, marks the owned database and
creates a private test bucket. Metadata collection authenticates as the actual
runtime role. Production hostname/TLS policy is not modified; this local diagnostic
proves no remote TLS/pooler connection, Storage contract, application factory or
native application Auth mapping.

The 1,020-second work budget reserves 90 seconds for owned cleanup. No unknown
database is dropped and no outside client is terminated. Leftover
runtime clients, Auth users, storage objects or temporary roles fail the
packet. CLI stop uses only this exact fresh project with `--no-backup`; final
Docker container/network/volume identities must return to their initial state.
Command EOF/reaping/process-group closure, owned descendants, released ports and
scratch inode/UID/nonce are checked before deleting scratch. Forced or uncertain
cleanup cannot pass. Docker images are runner cache, not a project-data deletion
claim.

The emitted prefix is `IV_SUPABASE_DIAGNOSTIC_RESULT`. Its `providerAccepted` and
`passed` values are always false, regardless of health. Only `diagnosticComplete`
can become true after collection, ownership, all five source guards, export,
stream EOF/reaping, process, port, Docker and scratch cleanup checks pass. Workflow
exit zero means that diagnostic collection completed; it never means provider or
test acceptance. An incomplete collection or cleanup exits nonzero.

Disposable CLI status/start output may contain credentials. Original command
streams remain only in controller memory; the receipt keeps their observed byte
counts and hashes. Every retained capture, JSON field and error is retrospectively
sanitized using byte-preserving substitutions of actual parsed local status keys
plus JWT/key patterns. Only the
sanitized bytes have retained gzip payloads and their own hashes. These are not
independently replayable original captures. Missing a complete key inventory after
stack startup withholds stream payloads. No raw config, dotenv or credential file
is uploaded. Failure evidence remains failure evidence.

Actual hosted Supabase, verified remote TLS/pooler behavior, Vercel environment
access/deployment, full application Auth/Storage selection and full AI acceptance
remain separate gates. No hosted account/settings, paid resource or model call
occurs. The application browser packet stays paused until provider acceptance.
