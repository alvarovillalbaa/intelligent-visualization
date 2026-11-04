# Normal quality CI — attempt 2

The [normal run 41737159119](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/41737159119) failed on 2026-11-03 at `npm test` (exit 1), independently of the focused CSV acceptance run. It checked activation `c57370e076909ea1ebc25f82c898bc90cd95258c` with the unchanged `ci.yml`.

- Setup, local doctor, lint and typecheck passed.
- Vitest reported **433 passed / 41 failed of 474 tests**, across **22 passed / two failed of 24 files**; duration 10.25 seconds.
- All 41 failures were Course fixture checks: 20 artifact and 21 download. The [JSON receipt](report-csv-import-normal-ci-attempt-2.json) retains their exact identities and first failure excerpt.
- Provider checks, data export, data verification and build were **skipped**.
- Actual profile: **Ubuntu 26.04.1** (`ubuntu-latest`, image 20261025.179.1), **Node v22.23.4**. This differs from the focused run’s Ubuntu24/Node24 profile.

The first failure was `AssertionError: Only repository modules may load.` at `tests/unit/course-artifact.cases.mjs:66:12`. Both Course fixture loaders retained a trailing separator in their repository root, then added another separator in their containment guard. Root later normalized those roots with `path.resolve(...)`, preserving the guards and assertions; this run predates that local correction and provides no pass evidence for it.

[Focused attempt 2](report-csv-import-checks-attempt-2.md) separately records 168 passing unit cases and six passing/two timed-out browser cases. The normal workflow has no focused 373-input seal guard; its own checkout and totals remain distinct. No rerun, local test, source modification or publication was performed to collect this receipt. The historical attempt-1 lint failure remains unchanged. Receipt authored 2026-11-04.
