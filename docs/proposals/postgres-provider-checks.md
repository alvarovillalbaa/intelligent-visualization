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

One public Ubuntu 24.04 job, capped at twenty minutes, checks a pinned source in
owned disposable scratch. Node 24.21.0 prepares the npm lock with only three
dependency additions (pg 8.23.1, its types 8.23.1 and Playwright 1.57.0) and the
three obsolete direct dependency removals. All other direct resolutions must
remain exact, and actual alternative-database graph nodes must be absent. The
generated lock is retained losslessly, then installed frozen with lifecycle
scripts disabled. No local installation follows the failed Storage Guard reserve.

Focused cases:

- Seven configuration cases: explicit PostgreSQL/loopback selection and rejected
  missing/unsafe configuration, without a database fallback.
- Twenty-eight real PostgreSQL cases: three existing provider regressions on the
  new engine, eleven transactional/type/schema/isolation invariants, eight
  complete legacy slide/access/session scenarios and six private backup cases.
  Each creates and marks its own disposable database, closes its pools and drops
  only the exact owned resource after checking its marker and zero clients.
- Two real Chromium profiles, desktop and narrow mouse/keyboard: seeded sign-in,
  session reload, read-only slide editor, authored workspace creation/reload,
  sign-out/protected redirect and a new sign-in. Models and hosted providers stay
  disabled. These are separate from the closed Course download identities.

Scoped lint/types, actual setup/doctor and readiness precede the browser. The
runner retains original test JSON and complete bounded command/server streams,
even on failure; asserts exact case identities/CLI success and original source
hashes; stops owned server/processes; verifies marked app-database teardown and
absence of fixture databases; and removes scratch only after identity and process
closure checks. Any uncertain cleanup fails acceptance. No unknown database is
dropped by its name. The temporary workflow is QA-only and retired after use.

Local acceptance does not prove hosted Supabase/RLS/storage, account migration,
canonical Course/Report saving, live AI/Eve, physical devices or full-product
completion. Database backups do not include stored objects. See
[the migration and rollback boundaries](../postgres-migration.md).
