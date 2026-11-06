# PostgreSQL provider and slide compatibility checks

The owner's standing "I approve everything / Keep going / Do all the work"
authorization covers this necessary database/dependency/CI implementation under
the [All projects direction](https://app.notion.com/p/3b6a1ee8bd06803e99d1cf6b0218c207).
No paid plan, real model/provider call, live migration or production data is used.
The source remains a candidate until hosted database/storage configuration is
available. Existing deployments and old database/storage files are untouched.

The implementation replaces the local file database with standard PostgreSQL,
keeps canonical contracts and slide behavior, removes obsolete runtime providers,
and converts setup/doctor/private database portability tools. The normal CI
workflow is preserved with an additive disposable PostgreSQL service. Its old
474-case/build and four Course browser receipts retain their original sources;
they are not rerun or relabelled as this candidate's acceptance.

Attempt 3 uses one public Ubuntu 24.04 job, capped at twenty minutes, on
`qa/postgres-provider-20261106-3`. It checks a pinned source in owned disposable
scratch with Node 24.21.0. It installs the accepted npm lock frozen with lifecycle
scripts disabled; it does not regenerate the lock or rerun accepted core cases.
The lock remains 618,662 bytes with SHA-256
`b18dd278e6eded698e269d2e8400b0359083a8ba34de4721227a70b5e27c0d59`.
Its pg 8.23.1, pg types 8.23.1 and Playwright 1.57.0 versions, other direct
resolutions, and absence of actual alternative-database nodes remain checked.
No local installation follows the failed Storage Guard reserve.

The carried core comes from source
`a5a702ea20108d3ed376fab9a181b838dd5897e0` in the preserved
[attempt 2 receipt](../results/2026/11-06/postgres-attempt-2.json), whose SHA-256 is
`500b26672802fe0b82c25436d14cae7a6e329e905f2f2a87c41c7b7a8ad34384`.
The controller validates its original complete base64 captures and hashes,
successful CLI exits, exact seven/twenty-eight test identities, original JSON
results, owned database/scratch cleanup, and frozen lock. The current exported
input set must match its 251 paths; all 249 core inputs must have identical hashes.
Only `tests/e2e/postgres-app.spec.ts` and `playwright.postgres.config.ts` may differ.
The new report includes the original core JSON and marks it as carried rather
than newly executed. Attempt 2's two failed browser identities and overall failed
packet remain failures; no browser result is carried as acceptance.

Focused cases:

- Seven carried configuration cases: explicit PostgreSQL/loopback selection and rejected
  missing/unsafe configuration, without a database fallback.
- Twenty-eight carried real PostgreSQL cases: three existing provider regressions on the
  new engine, eleven transactional/type/schema/isolation invariants, eight
  complete legacy slide/access/session scenarios and six private backup cases.
  Each creates and marks its own disposable database, closes its pools and drops
  only the exact owned resource after checking its marker and zero clients.
- Two current real Chromium profiles, desktop and narrow mouse/keyboard: seeded sign-in,
  session reload, read-only slide editor, authored workspace creation/reload,
  sign-out/protected redirect and a new sign-in. Models and hosted providers stay
  disabled. These are separate from the closed Course download identities.

Current scoped lint/types, actual setup/doctor and readiness precede the browser. The
runner retains original test JSON and complete bounded command/server streams,
even on failure; asserts exact case identities/CLI success and original source
hashes; stops owned server/processes; verifies marked app-database teardown and
absence of fixture databases; and removes scratch only after identity and process
closure checks. Any uncertain cleanup fails acceptance. No unknown database is
dropped by its name. The temporary workflow is QA-only and retired after use.

Attempt 3 preserved complete UI assertions but failed on aborted streamed RSC and
action responses. Attempt 4 records each exact admitted Request's transition and
received headers. Only `net::ERR_ABORTED` for an observed 200 `text/x-component`
RSC read at the exact target, or the admitted action with its exact same-origin
redirect target, can be classified separately after that transition's UI checks
and the final durable reload/new-session checks pass. Auth explicitly targets
`/app`, whose route resolves the seeded workspace. Missing responses, assets,
documents, unknown transitions, wrong targets/types and other errors still fail.
Classified cancellations remain bounded original evidence; no complete-body
network-success claim is made. See [Playwright request events](https://playwright.dev/docs/api/class-request)
and the pinned [Next action reducer](https://github.com/vercel/next.js/blob/v16.1.6/packages/next/src/client/components/router-reducer/reducers/server-action-reducer.ts).

Local acceptance does not prove hosted Supabase/RLS/storage, account migration,
canonical Course/Report saving, live AI/Eve, physical devices or full-product
completion. Database backups do not include stored objects. See
[the migration and rollback boundaries](../postgres-migration.md).
