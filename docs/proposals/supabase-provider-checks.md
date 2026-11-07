# Fresh Supabase contracts after observed Storage interoperability fixes

Prepared 7 November 2026. Inactive QA7 packet: review and pin its source before
creating `qa/supabase-provider-20261107-7`. Permanent CI and application factories
remain untouched. No local runtime, installation or deployment is authorized here.

## Evidence and bounded change

[QA5](../results/2026/11-07/supabase-provider-attempt-5.json) executed all 90 cases,
with 88 passed and two native Storage failures; its overall verdict remains false.
[QA6](../results/2026/11-07/supabase-storage-diagnostic-6.md) completed observation
only, with zero tests and provider acceptance/passed false. Its exact JSON is
306,883 bytes, SHA-256
`0988205dcd19177cfb513f67ae35578705d850527c17936f649804710cbe42e1`.

The actual losing immutable POST returned HTTP 400 with code
`KeyAlreadyExists`, error `Duplicate` and body statusCode `409`; the winner's
authored bytes remained exact. Anonymous list and DELETE returned exact EOF
`[]` with HTTP 200, while independent service reads after every operation
confirmed the target's exact original size/hash. Both original and well-formed
binary anonymous writes were denied and their candidate keys remained absent.
These are observed request-specific outcomes, not a generic error/200 waiver.

Only these three prior runtime inputs may differ from QA5:

- `packages/provider-supabase/storage.ts`: recognize the observed explicit
  `KeyAlreadyExists` code within the existing immutable duplicate-status boundary.
- `tests/unit/supabase-storage.test.ts`: cover that exact structured code.
- `tests/integration/supabase-storage.test.ts`: permit only the exact list/DELETE
  method/path empty-array response, with independent target byte/size/hash
  retention after every operation; retain strict denial and absence checks for
  both write candidates, including the well-formed binary control.

The other 293 of QA5's 296 inputs must match byte-for-byte. The diagnostic script
is an additional exported/static-checked source; the protected schema, migration,
lineage, application auth and factory behavior do not change. All six prior
failed/nonacceptance JSON receipts are byte/hash pinned by the controller. No
prior passed case or diagnostic exit is carried into acceptance.

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
