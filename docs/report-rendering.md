# Report Rendering

Published report artifacts use accessible inline SVG for charts in the current implementation slice.

Rationale:

- Published reports must render without the Next.js application.
- Published reports must not load Recharts or any chart runtime from a CDN.
- Inline SVG keeps the artifact deterministic and easy to hash.

The editor may continue to use shadcn charts over Recharts. The artifact compiler owns the standalone rendering strategy.

The React report preview displays chart, KPI and table provenance as supplied
text, including nested tab blocks. Charts marked illustrative visibly say
“Illustrative values.” separately from their source. Empty charts keep their
title and qualifications with an explicit missing-data message and no graph.
See the [preview repair and focused proof limits](results/2026/10-27/report-qualifications.md).

Chart preview and standalone export share series validation, category-key
selection, column ordering, radial-data rules and colors. Composed charts use
the first series as bars and subsequent series as lines, with labelled marks.
Pie and donut charts show a separate panel for each supplied series. Negative
or zero-total radial series retain their values in the data table and show an
unavailable message. Numeric strings, missing series/category values and
duplicate series keys also retain their table evidence without a misleading
graph. Null values remain distinct from missing values and real zero.

Every preview chart includes a typed data table with all supplied columns,
including columns outside the plotted series. Cartesian axes include zero;
linear lines/areas preserve null gaps and isolated points. Recharts still owns
interactive rendering and tooltips; standalone HTML retains inline SVG. Source
and prop checks do not establish browser painting, tooltip behavior or layout.

Interactive marks use a separate normalized plotting projection to keep large
finite values within Recharts' arithmetic range. Category labels, tooltips and
data tables read the original values; supplied records are not rewritten.
See the [preview parity checks and limits](results/2026/10-28/report-chart-preview.md).

The [Report editor](report-authoring.md) and React preview now use the canonical
12/8/4-column layouts. Preview cells scroll and accept keyboard focus; container
queries choose layouts from the preview's available width. The editor can force
a breakpoint for its unapplied preview. Missing or invalid legacy placements
fall back to readable source order. The [standalone Report export](report-export.md)
uses the same grid geometry and breakpoints, expands to source order for print,
and retains accessible chart data tables alongside its inline SVG. The general
compiler reports unusable placements as `REPORT_LAYOUT_FALLBACK` rather than
dropping content. Browser layout, download and print acceptance remain unverified.
