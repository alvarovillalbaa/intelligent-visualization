# Terminal workspace removal qualification

Saved Course and Report rows now offer **Remove from workspace**. Confirmation
loads the current saved tuple and explains that removal stops new private/public
reads while history and files remain retained. Lost responses keep the same
request/payload; stale reviews require a new review. Fresh authorization runs on
every retry. The server revokes publications and terminalizes the parent without
changing its document/hash/revision, retained pointer or linked graph. Slides
remain outside this control. [Behavior and rollout](../../../workspace-removal.md).

## Accepted evidence

- **32 core identities** at `bbc6f6391539dbec8a783f0d5b75fae8e9a5c1c1`:
  [overall-failed attempt 4](workspace-removals-attempt-4.md), run
  [43321493739](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/43321493739),
  job `131543009901`. All 18 HTTP/client cases and 14 PostgreSQL cases passed.
  This includes authorization/replay/CAS, private and cached reads, v2 portable
  restore without invented receipts, legitimate v1 import, explicit upgrade/peer
  refusal and actual restricted-role hosted-schema removal/metadata validation.
- **Two fixture completions** at `773036fd67960d0e33bfecae8d534f3e6c09f776`:
  [overall-failed attempt 5](workspace-removals-attempt-5.md), run
  [43322250960](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/43322250960),
  job `131545635355`. The direct SQL waiter observes the committed tombstone;
  all 12 child tables reject retained-row insert/update/delete/retarget/truncate,
  and parent/cascade guards preserve the graph. Both fixture drains rechecked
  zero clients/ownership and dropped only their marked databases; the direct
  database/role inventory was empty afterward. No accepted core case was rerun.
- **Four complete Chromium identities** at
  `c6c8490f03c201574aab38623179613edd672765`: Course/Report × desktop/narrow
  emulated touch. [Passing run 43323318029](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/43323318029),
  job `131549331806`, records real portable login, save, compiler, storage and
  publication; stale review conflict; actual committed removal with a lost
  response; identical retry; workspace reload and dirty second-tab preservation
  after an actual 404 save. Each journey refused eight fresh live/immutable
  GET/HEAD/conditional reads (32 total). All retained file hashes stayed exact;
  the four snapshots contained 7/8/9/10 authored objects. These are four new
  removal journeys, not replays of closed export/password-gate identities.

There is no single new 34-core-case invocation or combined old-provider pass
count. The passing browser controller verifies 451 unchanged input files against
the original core source and exact core test/config files against the completion
source. Product runtime/dependencies and frozen lock remain unchanged between
those accepted boundaries. All six failed overall runs retain their false verdicts.

## Receipt readback and migration packaging

The [browser receipt](workspace-removals-browser.json) is raw 534,195 bytes,
SHA-256 `a7f3b7ce183171bebaa6e59f62d2f3914b4ed9ffc9e0170b9c55fb1bf898431d`.
Its repository JSON rendering has SHA-256
`54d08431e942c991313d1e06ee9fc0e16195d354f956114fa18763ad796176b7`.
Independent readback verifies all 18 current command streams, four source guards
of 689 files, four retry observations, four screenshot captures and the preserved
core references. Across the five structured attempt packets, all 56 retained
stdout/stderr captures match their byte counts/digests. Both raw preflight logs
are retained separately.

All four confirmation images were decoded, hash-checked and visually inspected:
[Course desktop](removal-course-desktop.png), [Course narrow](removal-course-narrow-touch.png),
[Report desktop](removal-report-desktop.png), [Report narrow](removal-report-narrow-touch.png).
They show the reviewed second revision and retention disclosure fitting the
desktop and narrow dialogs. Playwright 1.57.0 used its bundled Chromium Headless
Shell 143.0.7499.4. This is emulated touch, not a physical-device or full contrast,
screen-reader, production-build or product-wide accessibility qualification.

The [CLI-named migration](../../../../supabase/migrations/20261112225304_terminal_visualization_removal_v2.sql)
is 12,542 bytes, SHA-256
`2ac5379d008c8ca3ddd3b771ae74c5c896a8ce8d9f4c6dcd5c7ae3ea6b858284`.
[Generation metadata](workspace-removals-migration.json) records CLI 2.117.0,
help discovery and exact readback against the same qualified SQL factory. No
database was contacted. Default CLI metadata reads initially failed outside the
writable roots; the documented [task-scoped CLI home and telemetry opt-out](https://supabase.com/docs/guides/local-development/cli/getting-started)
allowed file generation without changing account state. Only owned CLI residue
was removed. The current [CLI migration command](https://supabase.com/docs/reference/cli/supabase-migration-new)
created the filename; immutable v1 was not edited.

## Closure and remaining boundaries

All nine owned current command/server groups stopped. The marked application
database was rechecked and dropped with zero clients, fixture databases or test
roles. Final source parity passed; controller completion removed its owned
runner scratch. Workflow `416649212` was disabled and the seven exact temporary
QA branch refs were deleted. Permanent `ci.yml` is unchanged; skipped normal CI
is not called a pass.

The candidate stays draft/off production. Old apps, workers, backup snapshots and
tools must be retired before installing v2; triggers cannot revoke old SELECTs
or evict initialized pools. Supabase CLI apply/reset/history reconciliation,
advisors, a new full-stack Supabase run, physical devices and hosted production
remain unverified. Restoring a pre-removal backup into an empty target cannot
recover tombstones absent from both. No storage deletion, paid service, model
call, new account, production migration or unchanged Vercel environment-403 retry
was performed. Storage Guard's 4.7/38 GiB failure was respected.
