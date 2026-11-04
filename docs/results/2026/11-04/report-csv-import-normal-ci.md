# Normal quality CI — passed

[Run 41812991753](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/41812991753) passed on 4 November 2026 at `7a70755b9a56656d3510f7427075e556eb69ea84`, using the unchanged automatic `ci.yml`. The [JSON receipt](report-csv-import-normal-ci.json) records every step, actual summaries, export/verify results and the decoded-log hash.

| Check | Actual outcome |
| --- | --- |
| Local setup and doctor | Passed |
| Lint | Passed; 0 errors, 16 warnings |
| Typecheck | Passed |
| Unit tests | **474/474**, all 24 files |
| Local-provider checks | **3/3**, one file |
| Authored local data export | Passed |
| Export verification | Passed; 18 files checked |
| Production build | Passed; Next.js 16.1.6 webpack, 15 static pages |

Actual profile: **Ubuntu 26.04.1**, runner image 20261101.186.1, **Node v22.23.4**. The two Course fixture suites that failed in [attempt 2](../11-03/report-csv-import-normal-ci-attempt-2.md) now pass in the actual 474-case run. The [attempt-1 lint failure](../11-02/report-csv-import-normal-ci-attempt-1.md) remains historical. Lint still emits 16 warnings, including unused variables and hook dependencies.

[Focused CSV acceptance](report-csv-import-checks.md) independently passed 176/176 against its preparation source and 373-input pre/post seal. The normal workflow checks the activation commit and does not implement that seal guard. Unit scopes overlap; their counts are not additive unique coverage.

This is local-provider fixture and build evidence, without a production account, hosted Auth, live external-provider/model, physical-device or production-browser claim. No restart, local test/build/install, source change or publication was performed while collecting it.
