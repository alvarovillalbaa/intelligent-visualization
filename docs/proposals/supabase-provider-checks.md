# Disposable Supabase provider verification packet

Prepared 7 November 2026. This inactive packet executes no local host runtime and
does not enable the Supabase selector. Review and pin the candidate source before
creating `qa/supabase-provider-20261107-4`; the permanent workflow is untouched.

Attempt one at `5babe6dc068669a1f5d970cb22b9d0953d4ae818` failed semantic
TypeScript checking before CLI setup or any test. Preserve its
[failed receipt](../results/2026/11-07/supabase-provider-attempt-1.json), 188,095
bytes, SHA-256
`a99c0f71ff7dd1c5df2cd06e1cab1485f58fbdd54e249480db5ab1f9c98944b6`.
This retry validates that receipt's identity but carries no passed cases. The new
candidate includes the route response byte-type repair and the scoped legacy
namespace ownership repair; their final source and tests need review before pinning.

Attempt two ([receipt](../results/2026/11-07/supabase-provider-attempt-2.json),
323,072 bytes, SHA-256
`dd03c3c755b7a1f1b62fe62366596b447ee0632e8db306053c58c9bd87c651ae`)
passed 28 local cases, failed 13 shared Supabase cases at fixture health and left
48 cases unrun. [Diagnostic three](../results/2026/11-07/supabase-provider-diagnostic-3.md)
completed collection only: its exact JSON is 266,607 bytes, SHA-256
`150464cbaaece4dcd6ba28bf411ebc35187b8ca7127d1c3f3717513e02321e49`,
with provider acceptance/passed false and zero tests.

The observed runtime had one incoming grant to the exact private-schema owner:
ADMIN true, INHERIT false, SET false. QA4 changes only the runtime membership
predicate to permit that owner administrative grant, while rejecting every
outgoing membership and all other incoming grants. The owner already controls
schema DDL; this is not a general administrator exemption. One additional actual
Supabase case checks that an unrelated NOLOGIN role with the same ADMIN-only
options is refused, then restores health by revoking its owned test grant. The
existing untrusted SET-grant case remains.

All three prior receipts are byte/hash pinned. Of the 296 prior exported inputs,
only `packages/provider-supabase/schema.ts` and
`tests/providers/supabase-contracts.test.ts` may differ; the other 294 must match
exactly. The migration and lineage remain unchanged. All 90 cases run freshly;
no prior passed case is carried and no diagnostic exit is accepted as a test pass.

One public Ubuntu 24.04 job uses Node 24.21.0 and the checksum-pinned Supabase CLI
3.0.0 archive already verified by the source probe. All app source exports,
dependencies, CLI files, HOME/config/cache/temp files and reports live inside an
exclusive controller-owned `/tmp/ivsb-*` directory. Source/index/symlink guards
check the original checkout five times, and exported inputs retain their hashes.
The existing lock is frozen; installation uses `npm ci --ignore-scripts`.

The packet runs scoped ESLint and semantic TypeScript checks, then exactly 90
cases from eleven explicit files: 28 affected local PostgreSQL regressions on a
separate PostgreSQL 17.6 service, 14 Supabase provider contracts, eight native
Storage/Auth contracts and 40 focused storage/attachment/password/URL/namespace
unit cases, including four new `legacy-upload-ownership.test.ts` cases.
Source-derived literal identities, ordinary per-file Vitest JSON, CLI zero exit,
no skips/todos/retries/duplicates and exact counts are required. Failed JSON is
retained before the success gate. No historical full suite, build or browser runs.

The actual disposable CLI stack keeps PostgreSQL, Auth, Storage, Kong and
PostgREST. Other services are disabled/excluded. CLI help is read before each
command family; the generated TOML is converted to the supported JSON shape and
removed, leaving one unambiguous owned configuration. Exact project/workdir labels,
running DB/Kong containers and their host-port bindings are verified before any
administrative database or bucket mutation. The CLI-generated migration
filename is preserved; explicit setup then gives its fresh restricted runtime
role LOGIN and an authored disposable password, marks the owned database and
creates a private test bucket. Tests authenticate as that actual runtime role.
Production hostname/TLS policy is never relaxed: only the internal injected
database and a transport-only HTTPS-to-owned-loopback Storage mapping are used.
This proves no hosted TLS/pooler connection or native application Auth mapping.

The 1,020-second work budget reserves 90 seconds for owned cleanup. No unknown
database is dropped and no outside client is terminated. Leftover local fixture
databases, runtime clients, Auth users, storage objects or temporary roles fail the
packet. CLI stop uses only this exact fresh project with `--no-backup`; final
Docker container/network/volume identities must return to their initial state.
Command EOF/reaping/process-group closure, owned descendants, released ports and
scratch inode/UID/nonce are checked before deleting scratch. Forced or uncertain
cleanup cannot pass. Docker images are runner cache, not a project-data deletion
claim; the separate workflow service remains owned by GitHub Actions.

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
remain separate gates. Local native Auth cases create and delete authored
disposable users. No hosted account/settings, paid resource or model call occurs.
