# Visible report qualifications

27 October 2026. Status: renderer repair implemented and 18 focused rendering checks passed; source/hosted publication readback pending. The all-project goal is active.

Baseline: [da4d424965d68bf7e1ff41ce9dd5aa0e36c34325](https://github.com/alvarovillalbaa/intelligent-visualization/commit/da4d424965d68bf7e1ff41ce9dd5aa0e36c34325). The [owning audit](report-qualifications-audit.md) found that the React report preview hid illustrative flags and chart/KPI/table provenance already carried by the canonical schema and standalone artifact compiler.

## Behavior

[ReportPreview](../../../../components/visualizations/renderers/report-preview.tsx) now displays “Illustrative values.” when a chart's supplied flag is true and renders its supplied provenance independently of the existing source line. KPI and table provenance also appears beside their values. Recursive tabs inherit the same rendering. Ordinary JSX escapes the text; no source, data value, instruction, schema or artifact compiler is changed.

The chart schema permits empty data. Empty-data charts now retain title, description, source and qualifications, with “No chart data available.” and no graph/image wrapper. An empty series array takes the same defensive path, although canonical series require at least one item. Nonempty chart branches, colors, source text and accessibility labels remain unchanged, including the existing composed-to-bar fallback.

## Focused checks

The shared [authored rendering cases](../../../../tests/unit/report-preview.cases.mjs) transpile the actual TSX with TypeScript and render it through real ReactDOM/Recharts server rendering. Runtime imports are restricted to the real React JSX runtime and Recharts; the renderer VM rejects network calls. The [small Vitest entry](../../../../tests/unit/report-preview.test.ts) registers the same cases in the existing unit discovery, without configuration or dependency changes.

The same cases can run without installing an IV environment when compatible tools already exist:

```sh
IV_TEST_PROJECT_ROOT=/path/to/existing/project node --input-type=module - <<'JS'
import { test } from 'node:test';
import { registerReportPreviewChecks } from './tests/unit/report-preview.cases.mjs';
registerReportPreviewChecks(test);
JS
```

`IV_TEST_PROJECT_ROOT` selects an existing React 19.2.3, ReactDOM 19.2.3, Recharts 2.15.4 and TypeScript 5.9.3 installation; the default is this repository after its normal installation. `IV_REPORT_PREVIEW_SOURCE` selects an immutable TSX snapshot for regression sensitivity. No absolute machine path is committed.

Node 24.21.0 ran **18 cases: 18 pass, zero failures/skips/cancellations**. The identical final cases against the immutable baseline renderer produced **1 pass / 17 fail**, with no skipped/cancelled cases. Those failures cover hidden chart/KPI/table qualifications, recursive notes, empty-chart metadata and escaped qualifications; they do not depend on a missing new export. Owned baseline/runner copies were removed after terminal execution. The Vitest discovery wrapper was syntax-checked; the full Vitest suite was not executed.

| Frozen artifact | SHA-256 |
| --- | --- |
| Baseline renderer | `76d87434465acefa23070bd49fdcbb63a6f0cfc90014ac484a3b2a4a138b6bcc` |
| Checked renderer | `3713c823c9a5e24f9c2b29c2167b34cf3da0403b0fab7c42bf5d6646654faa0c` |
| Identical shared cases | `281a95e8be19a0766c95e05c7e99712831843e163f675ad74f89bea8ddb40878` |
| Vitest entry | `e80fd6658cf9a590e922cb004734db8750fe431a2ac20094ebd84fdd8c0670a9` |

Cases cover illustrative true/false across all six chart kinds, supplied chart/KPI/table notes, recursive tabs, empty data/series, escaping, unchanged source/metric/accessibility text, frozen input preservation and empty notes without invented qualifications. These inputs are authored renderer-prop subsets; the checks do not validate complete canonical documents, draw client charts or measure layout.

Independent source review found no scoped blocker. Both TypeScript files and the shared JavaScript cases passed syntax parsing; `git diff --check` passed. Six owned text files passed whitespace/newline checks, twelve local Markdown targets and both local source imports resolved. Prompts, schemas, compiler, persistence/provider/API code, dependencies, configuration and workflow files compare unchanged against baseline.

## Publication and limits

The existing main-push workflow runs broad tests, provider checks, data export, typecheck and build. Source publication will use the commit-specific `[skip actions]` annotation to keep unapproved backend/provider suites unrun; the workflow remains unchanged and no green CI claim will be made. Vercel's normal hosted build/delivery will be verified separately under the existing publication authorization.

No local install, full Next build, broad TypeScript program check, browser, generation, account, persistence, provider or model call ran for this repair. Browser chart layout, model output quality, all-format durable saves/publication and existing provider/Auth gates remain unverified. Existing source-entry and multi-format acceptance proposals retain their original pending approval status.

Focused results are complete. Immutable GitHub/exact-SHA hosted delivery readback pending.
