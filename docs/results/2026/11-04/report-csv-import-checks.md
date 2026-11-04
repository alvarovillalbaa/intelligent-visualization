# Report CSV import — focused acceptance passed

[Run 41812992637](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/41812992637) passed on 4 November 2026: **176/176 checks** — 168 unit cases and eight Chromium browser cases. Every approved name/profile matched exactly; there were no failures, skips, retries, flaky or global browser errors. The [JSON receipt](report-csv-import-checks.json) retains all identities, outcomes, phase markers and the decoded-log hash.

- Checked source: `abbd4d957290c89771d558a8e4d4498bbe6401f7`; activation: `7a70755b9a56656d3510f7427075e556eb69ea84`.
- [Locator-repaired seal](../11-03/report-csv-import-source-locator-repaired.json): **373 inputs**, SHA-256 `6171b117ab8b1085370bf3148808d52302bdd12df6b51ff9b65084243afbecb7`. Pre/post source path, mode, length, hash and pinned-manifest guards passed.
- Actual profile: Ubuntu 24.04.5, Node v24.21.0, Playwright 1.58.2. Eight browser cases completed in 39.0 seconds, once each, at desktop and narrow touch-emulated sizes.

Both formerly blocked held-read cases completed all 74 fixed phase markers, including header toggle, replacement, stale release, cancellation and oversized-file rejection. Neither emitted a cleanup-failure marker. The four scenarios also exercised explicit Add/Apply, table/source undo and redo, preserved snapshots, guest reload, a later Course sibling and quota-failure retention.

The strict acceptance step and identity-checked owned-file cleanup succeeded. Actual cleanup reported: “Owned Report CSV tooling/output and copied files removed.” Raw temporary reports were removed; complete reduced outcomes are retained. No independent surviving-process inventory was part of this packet.

The [separate normal CI receipt](report-csv-import-normal-ci.md) records 474 tests, three local-provider checks, export verification and build. Its Node22/Ubuntu26 profile and overlapping unit scope remain separate. [Attempt 1](../11-02/report-csv-import-checks-attempt-1.md) and [attempt 2](../11-03/report-csv-import-checks-attempt-2.md) remain preserved failures; no run was restarted to obtain this result.

This proves the focused authored local-provider flow in Chromium, including touch emulation. Generation and the single HTML response are stubbed; artifact unit cases exercise the compiler independently. Hosted Auth, live providers/models, production accounts, physical devices and visual acceptance remain outside this proof. No local test/browser/build/install, product edit or publication was performed while observing this run.

The later publication edition updates only `README.md`, `docs/report-csv-import.md`
and `docs/proposals/report-csv-import-checks.md` among the 373 sealed inputs;
the remaining 370, including runtime code, fixtures and lockfile, are unchanged.
Reproduction remains pinned to the checked source above. Historical seals and
failed outcomes are retained; workflow retirement is not a new test run.
