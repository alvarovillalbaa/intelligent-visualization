# Standalone Report HTML export

27 October 2026 (UTC). Source published, 87 focused checks passed, and hosted
build/delivery verified. Browser saving, file opening, chart appearance and print
acceptance remain unverified. The all-project goal is active.

The owning [implementation plan](../../../implementation-plan.md) and
[Report authoring](../../../report-authoring.md) identified missing standalone
grid export after the editor release. Baseline is
`78e64961d0b23fe4619af4e8f5ea78ee025adcd9`: the compiler ignored all layouts and
rendered every chart type as first-series bars. There was no Report download UI.

## Behavior and files

The [Report download component](../../../../components/visualizations/report-download.tsx)
and [client helper](../../../../lib/client/report-download.ts) prepare a cloned,
validated Report through the existing artifact endpoint, then expose a native
Save Report HTML link. Preview integrates this only for committed Report drafts.
The client bounds response streaming, retains errors/retry and guards timeout,
document replacement, late completion and object-URL lifetime. Preparing a file
does not mutate drafts or source snapshots. The actual endpoint is unchanged
and was not called during verification.

The compiler's Report-only v2 path uses responsive grid placement, keyboard
scroll regions and print-flow CSS. Invalid, incomplete, overlapping or excessively
large placements fall back to readable source order with a structured warning.
All six chart kinds have inline SVG, supplied-data tables, independent source/
provenance notes and illustrative flags. Signed values, real zero and null gaps
have distinct rendering. Invalid/non-numeric or unsuitable radial data keeps
its table and an explicit unavailable message instead of invented values.
Sources and dataset-snapshot records remain visible after the grid, with supplied
hashes/counts labelled as supplied rather than newly verified. See
[Report export](../../../report-export.md) for exact bounds and mark semantics.

Download/preview Report HTML has no JavaScript, analytics or course-progress
runtime. The production Report analytics selection is retained. Course and
Slides retain their v1 HTML and manifest contracts. Schema, Auth, API/provider,
AI, dependency, persistence/store and CI paths are unchanged.

## Focused evidence

**87 checks passed, zero failures/skips/cancellations**, on Node 24.21.0:

- 64 [static artifact cases](../../../../tests/unit/report-artifact.cases.mjs)
  run the actual compiler with authored documents. They check numeric placement,
  source order, print CSS, fallback warnings, escaping, metadata, source records,
  exact hashes and actual SVG coordinates/segments/arcs. Cartesian checks cover
  proportional signed bars, real zero, null-separated lines/areas, isolated
  points, composed bars/lines and finite extreme magnitudes. Radial checks cover
  proportional arcs, separate series, the donut hole and invalid/zero totals.
- 23 [download cases](../../../../tests/unit/report-download.cases.mjs) run the
  actual client/helper through mocked fetch/Blob URLs, React SSR and direct
  source callbacks. They cover immutable preparation, names, input/stream bounds,
  invalid payloads, UTF-8 chunks, duplicate clicks, stale owners, unmount, timeout,
  retry and allocation failure. A real static-compiler-to-mocked-response-to-real-
  client round trip checks the response contract without invoking its HTTP route.

The identical 64 static cases against the immutable baseline compiler produced
**eight passes and 56 failures**, with no skipped/cancelled cases. The existing
compiler export executes in both runs; the red result is not a missing-export
failure. Four golden cases check exact Course/Slides HTML and full manifest
fingerprints for both preview modes, using the same fixed-ID documents and fixed
options. Those four pass on both baseline and final source. This establishes
preservation for those inputs, not all Course/Slides behavior.

Baseline compiler SHA256:
`105e22055b5cecfb0fa3a2bd03110cda0a1786dc3a5911a417293e546acacb81`.
Its owned temporary copy was removed after terminal execution. Static checks
use real Node SHA256 and actual schema/source functions; fixture UUIDs are
substituted and UUID ordering is not tested. Read-only compatible tooling
supplies TypeScript 5.9.3 and React/ReactDOM 19.2.3. The existing verified cache
loader supplies exact locked Zod 4.4.3 in memory without an install, extraction,
vendored copy or network fetch. Vitest entries register the same cases; its full
suite is unrun.

```sh
IV_TEST_PROJECT_ROOT=/path/to/existing/project \
IV_TEST_ZOD_ENTRY="$PWD/tests/helpers/locked-zod-cache.cjs" \
node --test-reporter=spec --input-type=module - <<'JS'
import test from 'node:test';
import { registerReportArtifactChecks } from './tests/unit/report-artifact.cases.mjs';
import { registerReportDownloadChecks } from './tests/unit/report-download.cases.mjs';
await registerReportArtifactChecks(test);
await registerReportDownloadChecks(test);
JS
```

Eight changed TS/TSX files passed syntax transpilation; this is not a semantic
program check. Independent source review found no remaining concrete blocker.
Eighteen owned text files, 30 local Markdown targets and 21 local source imports
passed whitespace/path checks.
`git diff --check` passed. Frozen groups use sorted relative path, NUL, bytes,
NUL:

| Group | Files | SHA256 |
| --- | --- | --- |
| Changed production source | 6 | `3f7a9f78e2ef99c09daf7001c0cf14976163eefa2228bd53e0aa6765c2387299` |
| Shared cases and Vitest entries | 4 | `9660415b57661feb59e01a0505e1624e44b28fa1c5df4ad3b3a8a6f484a41d90` |

These checks establish static HTML/CSS/SVG output and authored client logic.
They do not establish browser rendering, focus, native saving, file opening,
physical printing, real requests or hosted endpoint behavior. No local install,
full Next build, broad TypeScript program, dev server, browser, API handler,
backend/provider/database test or model call ran. Hosted saving/publication,
image delivery and provider acceptance remain separate work. The existing
[Report editor browser proposal](../../../proposals/report-editor-browser.md)
is unchanged and pending; it does not cover this new download flow.

The separately prepared [four-check export proposal](../../../proposals/report-export-browser.md)
does cover the actual local artifact route, native file saving/opening,
responsive CSS, print-media flow and a failed preparation/retry. It is inactive,
outside test discovery and workflows, pending explicit browser/backend/temporary-
CI approval. Its two TS examples, YAML scope, six shell blocks, copied imports,
seven local Markdown targets and whitespace passed static checks. Independent
source review found no blocker; those checks did not start a server or browser.
The four-file proposal SHA256 (sorted path, NUL, bytes, NUL) is
`2dc9dee2cbae525dcac5fb94f5e0f33c6c4c8e8ae88f3a64518ad162eeb8f1e0`.

## Publication

Source
[`19bf3130c181047458f34cd3ebcb84d7cc6247e9`](https://github.com/alvarovillalbaa/intelligent-visualization/commit/19bf3130c181047458f34cd3ebcb84d7cc6247e9)
was pushed to personal-repository main. Immutable connected GitHub readback
matches local blobs for ReportDownload (`421b8c814f3752ec8c466fcfa722aecbb59e05a0`),
the compiler (`4bd22de9e8ff587881c27c0be38ec5ee7d9d6189`), chart renderer
(`7bd237ed300121796862a86565a61e82f392169b`) and client helper
(`062339d2d930c5074c26ad45d1d4ad402bf5342c`). The commit-specific
`[skip actions]` leaves the broad backend/provider push suite unrun; the
SHA/event-filtered Actions API returned zero push runs. No workflow is changed
or green CI result inferred from that omission.

Vercel production
[`dpl_8LGaEaVpLuE2qrZ8sxLyNrAHjQzm`](https://vercel.com/my-team-4f230354/intelligent-visualization/8LGaEaVpLuE2qrZ8sxLyNrAHjQzm)
reached READY at that exact source SHA and owns the canonical alias. Logs show
successful compilation in 8.3 seconds, the TypeScript step, completed output in
57 seconds and deployment. This is hosted locked-dependency build proof; it
does not establish execution of the artifact endpoint.

A public [homepage](https://intelligent-visualization.vercel.app/) GET returned
200 and referenced that deployment in its script URLs. The delivered client
chunk `/_next/static/chunks/61-90c5850d01979f3b.js` returned 200: 156,794 bytes,
SHA256 `f160d3751859f1d59ae70b412a8d0b3b5cb6ed480a16bd36c5643e84b6db3424`.
Its bytes contain Download Report HTML, Save Report HTML, Retry Report HTML,
Preparing Report HTML and Report HTML download. This establishes source, build
and client-code delivery, not interaction or an actual saved file. The
documentation/proposal follow-up retains checked runtime/test bytes.
