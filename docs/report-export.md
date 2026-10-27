# Report HTML export

Open a generated Report's preview and choose **Download Report HTML**. When the
file is prepared, choose **Save Report HTML** to download it. The separate save
link keeps the file save a direct user action. Export uses the current committed
draft; apply editor changes first to include them.

The client validates a cloned Report using the existing authoring limits,
supplies missing generated layouts on that clone, and calls the existing
`/api/visualizations/artifact` endpoint. Preparing a download does not rewrite
the displayed draft, browser copy, workspace or source snapshots. The endpoint
already compiles all canonical document kinds with `preview: true`; no route or
Auth contract is changed for this flow. The response supplies HTML, not a
downloadable manifest.

The request has a 30-second timeout and an 8-MiB encoded response limit. Failed
or invalid responses keep the draft and expose Retry. A replaced document,
timeout, retry or unmount prevents an older request from installing a file for
the new draft. Object URLs are revoked when replaced or when preview closes.
Filenames use a bounded `report-*.html` name without path characters.

## Standalone rendering

Report HTML uses the canonical large/medium/small layouts, shared 40-pixel rows
and 12-pixel gaps, and container-width breakpoints at 768 and 1024 pixels.
Source order remains reading order. Keyboard-focusable scroll regions retain
long block content and qualifications. Print CSS expands the blocks into source
order without scroll clipping. These CSS rules still require browser and print
acceptance; static output checks do not prove their physical rendering.

The Report renderer emits inline SVG and an accessible data table for charts.
It retains every supplied series, source, provenance and illustrative-value
flag. Line and area gaps preserve missing values; bars include negative values
and zero. Pie/donut views use separate series panels, with an explicit unavailable
message for values those charts cannot represent. The composed schema has no
per-series mark definition: the standalone renderer uses first-series bars and
remaining-series lines, labelled in its legend. Empty or invalid chart data
keeps metadata and the data table instead of inventing values.

A visible Sources appendix carries supplied source and dataset-snapshot labels,
provenance, content hashes and any supplied row counts into the HTML file. These
are the document's records, not a new verification of external sources. The
compiler manifest keeps its existing source-hash semantics; the download does
not create or change snapshots.

The general compiler falls back to readable source order with a structured
`REPORT_LAYOUT_FALLBACK` warning when supplied placements cannot be used. It
does not silently drop blocks. General artifact grids end at line 10,000
(9,999 rows); larger coordinates fall back rather than depending on browser
clamping. This is a rendering bound, separate from the editor's 256-row limit,
based on the [CSS Grid specification's guidance for large grids](https://www.w3.org/TR/css-grid-2/#limit-large-grids).
The download client validates its cloned layout
before requesting compilation. The Report renderer version is
`visualization-report-html-v2`; Course and Slides retain their existing renderer
version and output contracts.

Preview-mode HTML has no analytics beacon or persistent course-progress code.
It does not load external JavaScript. Attached images still use labelled
placeholders; image delivery is separate work. Theme CSS is embedded as Report
CSS without permitting text to close its style element.

## Limits of this slice

An HTML file is not a hosted public Report. Workspace saving, publication,
provider acceptance and data import/new immutable snapshots keep their existing
gates. The local authoring bounds also apply to downloads. Browser download,
file opening, pointer/focus behavior, chart appearance and print acceptance
remain unverified until separately approved checks run. The inactive
[four-check export proposal](proposals/report-export-browser.md) covers native
file saving/opening, responsive/print CSS and the existing local artifact route.
The [Report editor browser proposal](proposals/report-editor-browser.md) retains
its separate scope and pending approval.
