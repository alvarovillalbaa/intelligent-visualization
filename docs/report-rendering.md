# Report Rendering

Published report artifacts use accessible inline SVG for charts in the current implementation slice.

Rationale:

- Published reports must render without the Next.js application.
- Published reports must not load Recharts or any chart runtime from a CDN.
- Inline SVG keeps the artifact deterministic and easy to hash.

The editor may continue to use shadcn charts over Recharts. The artifact compiler owns the standalone rendering strategy.
