# Fresh Supabase contracts after local fixture lifecycle repair

Prepared 7 November 2026. Inactive QA8 packet: review and pin its source before
creating `qa/supabase-provider-20261107-8`. Permanent CI and application factories
remain untouched. No local runtime, installation or deployment is authorized here.

## Evidence and bounded change

[QA7](../results/2026/11-07/supabase-provider-attempt-7.json) passed scoped lint
and semantic TypeScript checks, then passed 27 local cases and failed the last
portable case during fixture cleanup. The remaining 62 cases were unrun. Its
exact failed JSON is 307,635 bytes, SHA-256
`f7764d34669c564ee1c89b162c31ab37cb7cf529b0006d092369304a12dcfcaf`.
The fixture's immediate activity count was nonzero after pool-close calls. It
recorded no session identities or states, so a server-close observation delay
is a possible cause, not an established diagnosis. The local fixture-database
audit also failed; outer service teardown is a separate infrastructure fact.

Only `tests/providers/postgres-fixture.ts` may differ from QA7. Both pool-close
attempts must settle. A bounded three-second observation of actual server activity
records safe session metadata without query text; deletion still requires zero
sessions and an immediate exact database identity/ownership recheck. Use ordinary
DROP only, never termination or FORCE. Always close the fixture's admin pool on
success and failure. A remaining session, changed identity or uncertain cleanup
fails the packet; waiting is not acceptance of a nonzero count.

The other 296 of QA7's 297 inputs remain byte-identical, including the Storage
adapter, its expanded unit/native assertions, schema, migration, lineage,
application auth and disabled factories. The Storage interoperability correction
is still awaiting runtime acceptance. [QA6](../results/2026/11-07/supabase-storage-diagnostic-6.md)
retains zero tests and false acceptance flags. All seven prior failed/nonacceptance
receipts are hash-pinned; no earlier pass or diagnostic exit is carried forward.

## Full fresh execution

One public Ubuntu 24.04 job uses Node 24.21.0, the frozen dependency lock and
`npm ci --ignore-scripts`. It runs scoped ESLint and semantic TypeScript checking,
then all 90 cases in eleven explicit files, in this order:

1. Local PostgreSQL regressions: 28 (3 + 11 + 8 + 6).
2. Focused unit cases: 40 (14 + 4 + 6 + 12 + 4).
3. Supabase shared contracts: 14.
4. Native Storage/Auth contracts: 8.

Source-derived literal identities, exact per-file counts, ordinary Vitest JSON,
CLI zero exit, no duplicate/skip/todo/retry and all-pass results remain required.
Failure JSON is retained before its success gate. No historical full suite,
browser, generation or build is run. All 90 cases execute freshly across eleven
file invocations; the four application browser identities remain separate and unaccepted.

The actual disposable CLI stack keeps PostgreSQL, Auth, Storage, Kong and
PostgREST. Its CLI 3.0.0 archive/checksum pins, help discovery, single owned JSON
configuration, fresh project, exact Docker labels/identities and positive DB/Kong
running port mappings are retained. Only after ownership verification may setup
apply the existing migration, enable LOGIN/password on its fresh restricted role,
mark the database and create the private bucket. Real actual runtime LOGIN and
private service operations are used; explicit database injection and facade
transport remain local contract-test seams, not application/TLS/hosted proof.
The separate PostgreSQL 17.6 service supports only the affected local fixtures.

## Integrity and cleanup

All source, dependencies, HOME/cache/config/temp files and reports remain under
one exclusive owned scratch root. Five native/index/source guards, index/tree
identity, source export hashes and frozen-lock checks stay mandatory. Source
and exported runtime inputs cannot change during execution.

Keep the 20-minute job, 1,020-second work budget and 90-second cleanup reserve.
No unknown database is dropped or outside client terminated. Local fixture DBs,
owned objects/Auth users/runtime clients/test roles, command EOF/reaping/groups,
descendants, Docker containers/networks/volumes, ports and scratch identity/removal
must close normally. Forced or uncertain cleanup fails; the workflow-owned
separate PostgreSQL service is left to GitHub Actions.

Original streams exist only in memory. Retain observed original byte counts/hashes
plus explicitly sanitized gzip bytes/hashes using actual parsed local status keys
and byte-preserving credential/JWT/URL substitution. They are not independently
replayable original captures. No raw service key, config/dotenv or credential file
is uploaded. Preserve all failures.

Provider selection stays fail-closed until the full candidate passes. Actual
application factory/TLS/DNS/proxy/browser verification, hosted Supabase/pooler,
native application Auth, Vercel environment/deployment and full AI acceptance
remain pending. No hosted account/settings, paid resource or model call occurs.
