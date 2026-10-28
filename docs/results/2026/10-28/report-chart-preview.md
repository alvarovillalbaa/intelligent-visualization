# Report chart preview parity

28 October 2026 (UTC). Source implementation and 146 focused checks are
prepared; publication and hosted build/delivery verification are pending.
Browser painting, hover/touch behavior and layout remain unverified. The
all-project goal remains active.

Baseline: `2550180ba5867b536163c1325a0cb0c7904a8d22`. Inspection found that the
React preview rendered composed charts as bars and showed only the first
pie/donut series, while the standalone Report export already preserved those
semantics. Preview also omitted chart data tables.

## Changes and ownership

[ReportPreview](../../../../components/visualizations/renderers/report-preview.tsx)
now uses first-series bars/subsequent lines for composed charts, separate
pie/donut panels for every supplied series, typed data tables, labelled marks,
independent qualifications and explicit invalid-data messages. Linear lines and
areas preserve null gaps and isolated points, and Cartesian axes include zero.
Other Report blocks and grid behavior are unchanged.

The [shared chart model](../../../../lib/client/report-chart-model.ts) supplies
the same validation, category selection, columns and colors to preview and
artifact rendering. The artifact refactor preserves complete compiler outputs
for the checked inputs, including HTML, manifests and warnings.

Review reproduced a Recharts arithmetic issue with finite values near ±1e308:
its linear scale produced a NaN coordinate, and two 1e308 pie observations
overflowed the sum and produced zero angles. The
[client projection](../../../../lib/client/report-chart-projection.ts) scales
plot coordinates safely while keeping original categories, tooltip values,
legends and tables. Opaque source-row wrappers also prevent Recharts Cell props
or generated fields from overwriting valid dataset columns such as fill, value,
payload and name. Supplied records are not rewritten or renamed.

## Focused evidence

The final combined run passed **146 checks, zero failures/skips/cancellations**:

- 25 existing Report preview checks remain intact.
- 36 new preview checks use actual React/Recharts SSR and AST-exposed existing
  ChartBlock/local component functions. They inspect actual Recharts element
  types, accessors and props without painting, plus raw typed table output,
  metadata, all series, unavailable states, escaping and frozen input retention.
- 21 projection checks run actual Recharts pie composition/Cell merging and
  victory-vendor scale math with authored data. They cover large/subnormal
  values, separate radial factors, null/zero, reserved keys, exact raw tooltip
  values, null-category labels and overflow/underflow tick formatting.
- 64 existing static artifact checks cover grid/SVG output and legacy
  Course/Slides preservation after extracting shared rules.

The identical final 61 preview cases against the baseline renderer produced
**25 passes and 36 failures**, with no skips/cancellations. They execute the
existing ChartBlock function on both versions rather than failing on an absent
new export. Baseline renderer SHA256 is
`56bd413556a82c3854cebdee1141e254c967df748f0715a12d489e4a0616605d`.
The owned temporary baseline was removed after terminal execution. New projection
exports have no artificial missing-export red-suite claim; actual old-library
math reproduces the overflow before normalization.

Before/after extraction, 81 complete compiler results from the same 64 artifact
cases matched exactly. Aggregate ordered-output SHA256 is
`9dd74e200e77b8866c16c7944f04c5b09674211c5a477d3d06de76043c66c5c4`.
The owned temporary capture was removed. This covers those authored inputs,
not all possible reports.

Node 24.21.0 and read-only tooling supplied TypeScript 5.9.3, React/ReactDOM
19.2.3, Recharts 2.15.4 and victory-vendor 36.9.2. Both chart packages were
checked against this repository's lockfile. Artifact schema checks used the
existing verified in-memory loader for exact locked Zod 4.4.3. No package was
installed, downloaded or vendored locally. Vitest wrappers register the same
cases but the full suite was not run.

```sh
IV_TEST_PROJECT_ROOT=/path/to/existing/project \
IV_TEST_ZOD_ENTRY="$PWD/tests/helpers/locked-zod-cache.cjs" \
node --test-reporter=spec --input-type=module - <<'JS'
import test from 'node:test';
import { registerReportPreviewChecks } from './tests/unit/report-preview.cases.mjs';
import { registerReportChartPreviewChecks } from './tests/unit/report-chart-preview.cases.mjs';
import { registerReportChartProjectionChecks } from './tests/unit/report-chart-projection.cases.mjs';
import { registerReportArtifactChecks } from './tests/unit/report-artifact.cases.mjs';
registerReportPreviewChecks(test);
registerReportChartPreviewChecks(test);
registerReportChartProjectionChecks(test);
registerReportArtifactChecks(test);
JS
```

Six changed TS/TSX files passed syntax transpilation. `git diff --check` passed.
Twelve owned text files, eight local Markdown targets and twelve local source
imports passed whitespace/path checks.
Frozen SHA256 groups use sorted relative path, NUL, bytes, NUL:

| Group | Files | SHA256 |
| --- | --- | --- |
| Production source | 4 | `1eedd45e43b1f0a3ad8a732398d408a9590b6cc7fc0a517057e525f7df982b33` |
| Shared cases and Vitest entries | 5 | `95dd243cbf6f430e2d69d523394e0f787c9fb74b85fe7cda034cc4c055493c8f` |

These checks prove source logic, configured chart bindings, static output and
the exercised library math. They do not prove React lifecycle, client chart
painting, live tooltips, pointer/touch behavior, viewport fit or hosted requests.
No local build, broad TypeScript program, dev server, browser, API handler,
backend/provider/database test, model call or dependency/CI/Auth/schema change
ran. Existing browser/export approval requests remain pending; no new scope was
silently activated.

## Publication

Exact GitHub readback, the existing Vercel hosted build and public delivery will
be recorded after observation. Publication uses `[skip actions]` to leave broad
unapproved backend/provider push checks unrun, with no workflow edit or inferred
green CI result.
