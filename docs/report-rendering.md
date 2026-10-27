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
