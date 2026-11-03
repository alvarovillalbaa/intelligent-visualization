# Existing normal CI — activation attempt 1

The existing [CI run 41416992030](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/41416992030) failed on 2026-11-02 at activation `f460b04db4f5ee4c194eb3c62017b7adff3652b8`. This is separate from [focused Report CSV 176 run 41416992025](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/41416992025).

`npm ci`, `setup:local` and `doctor` passed. **`npm run lint` exited 1** with one error and 16 warnings. The error is `tests/unit/course-artifact.cases.mjs:180:10`, `@next/next/no-assign-module-variable`: do not assign to the variable `module`. All 17 actual diagnostics are retained in the [machine receipt](report-csv-import-normal-ci-attempt-1.json).

Typecheck, unit/provider tests, data export/verification and build were skipped after lint failed. The runner used Ubuntu 24.04.5 and Node 22.23.4. Existing `ci.yml` was unchanged and was neither skipped nor disabled. No source repair or rerun is included.
