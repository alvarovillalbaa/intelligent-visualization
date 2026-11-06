# PostgreSQL migration acceptance — 6 November 2026

The local PostgreSQL migration and durable legacy slide repository are implemented.
This is an isolated source candidate, not a production cutover or full-product
release. [Migration, backup and rollback boundaries](../../../postgres-migration.md).

| Evidence | Source | Actual execution |
| --- | --- | --- |
| Seven configuration and 28 real PostgreSQL cases | `a5a702ea20108d3ed376fab9a181b838dd5897e0` | [Attempt 2](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/42185790560), job `127785676561`; all 35 passed, ordinary CLI zero |
| Two desktop/narrow Chromium journeys | `6b521c8ae28a3f75482208a69d665180bb070524` | [Attempt 4](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/42188188649), job `127793454619`; both passed together, no retry/skip/flake/error |
| Current static/setup/doctor/readiness/shutdown and evidence closure | `531d6e53cff70372115cf5b71fb9ea61877b9e95` | [Attempt 5](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/42189219020), job `127796821479`; complete packet passed |

The [original current receipt](postgres-checks.json) validates the exact 35 core
identities, 33 prior original captures, exact two browser identities and 25 prior
current captures. All 249 core inputs match attempt 2; all 251 runtime inputs and
the lock match attempt 4. The current run does not rerun accepted cases. No single
37-case invocation or final-head broad suite/build is claimed.

The real PostgreSQL scope covers transaction/idempotency races, normalized email,
revision conflicts, native JSONB/timestamps, schema refusal/isolation, reopen,
legacy roles/invites/sessions, complete deck operations and private backup
round-trip/conflict/integrity. Files and fixtures are authored and disposable.

Both actual UI profiles sign in, retain the session after reload, open/reload the
seed slide editor, create/reload an authored workspace, sign out, verify protected
redirect and recover the workspace in a fresh session. Narrow is a 390px viewport
with mouse/keyboard, not touch or physical-device acceptance. Editor checks are
read-only; no generation or hosted provider call occurs.

Each browser profile records six cancelled streamed requests separately. Exact
admitted requests, received RSC/redirect headers and completed transition/UI and
durable reload checks support that classification. All other tripwire counters
are zero. This does not claim complete response-body transfer for those streams.

All nine current commands, eighteen current command streams and two server
streams are complete. The actual server served `/auth` 200, `/app` 307 and `/` 200.
The exact owned Next telemetry child exited naturally during a 0.512-second grace
window, without a signal. Final owned processes and fixture databases were absent;
port, marked app-database teardown, stream closure, scratch removal and native/
exported source checks passed. No local install/build/server/browser/database ran.

The lock was generated in attempt 1 and adopted as exact bytes: 618,662 bytes,
SHA-256 `b18dd278e6eded698e269d2e8400b0359083a8ba34de4721227a70b5e27c0d59`.
`pg`/types 8.23.1 and Playwright 1.57.0 are pinned; 57 other direct resolutions
remain exact. Alternative database packages were removed. Frozen install and
scoped lint/types passed; Playwright retains its color-environment warnings.

All four earlier overall failures remain immutable: type initialization, initial
static cancellations, streamed-navigation cancellations and the immediate detached
shutdown check. Attempt 4's overall `passed:false` remains false even though its
two journey identities passed and final scoped cleanup succeeded.

Keep main/production at the previous source until reviewed hosted database and
storage configuration exists. The existing environment-access403 was not retried.
Supabase/Auth/RLS/storage, hosted identity migration, Course/Report saving and
publication, live models/full Eve, physical devices and full-product acceptance
remain unfinished. Private database backups omit active sessions/idempotency and
do not copy stored media/artifacts. Files outside SQL may survive an uncertain
commit. Historical 474-case/build and Course download receipts retain their own
sources; neither was repeated or relabelled as migration proof.
