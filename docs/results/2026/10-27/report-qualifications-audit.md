# Source audit: report qualifications are hidden in preview

27 October 2026. Historical finding, now addressed by the [preview repair](report-qualifications.md). That receipt owns focused checks, publication status and remaining acceptance limits.
Inspected Git revision: `6c88958046e45d9c856514f69430355f19d7627e`; checkout was clean before this documentation change.

## Contract and trigger

The [report generation instruction](../../../../lib/ai/generate-visualization.ts) requires extrapolated charts to be marked illustrative and claims to trace back to supplied material.
The [canonical schema contract](../../../visualization-schema.md) is implemented by [ChartSpec and ReportBlock](../../../../packages/domain/entities.ts): charts carry `illustrative` and `provenance`; KPI and data-table blocks also carry `provenance`.

Source-derived trigger: a valid report chart with `illustrative: true` reaches [ReportPreview](../../../../components/visualizations/renderers/report-preview.tsx), which renders the chart title, description and optional `source`, but never renders its illustrative flag or provenance.
The same component renders KPI values and table rows without their provenance. A qualification stored only in those fields is therefore absent from the visible preview.
This can present extrapolated values without their supplied qualification; it does not establish that any real model has produced such a report in production.

The [canonical artifact compiler](../../../../lib/artifacts/compiler.ts) already renders chart provenance and “Illustrative values.”, plus KPI/table provenance. [Report rendering](../../../report-rendering.md) keeps that standalone renderer separate from the React preview.

## Proposed narrow remedy

Render a visible illustrative label when true and the supplied provenance beside chart, KPI and table content, including nested tab blocks.
Preserve source text, values, existing charts and generation prompts. This needs no dependency, Auth, schema, provider or production-configuration change.
Do not infer that this UI correction completes all-format persistence or publication.

## Evidence boundary

Read-only source inspection only: no tests, build, browser, generation, model call or provider operation ran for this audit. No production data was read or changed; provider/model cost was zero.
Only this findings document was added during the original audit. `git diff --check` and the untracked-file whitespace check passed; all six local file links resolved. The later repair has its own receipt and does not turn the original inspection into browser or provider acceptance.
