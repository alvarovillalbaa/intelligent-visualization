# Report draft grid authoring

27 October 2026 (UTC). Source published, 96 focused checks passed, and hosted
build/delivery verified. Browser acceptance is separately gated. The all-project
goal is active.

The owning [Report authoring](../../../report-authoring.md) and implementation
plan identified the missing DOM grid editor. This slice implements that client
workflow using existing schemas and dependencies. The independent
[all-format persistence proposal](../../../proposals/all-formats-persistence.md)
retains its authorization/provider gates.

## Behavior

The editor supports independent 12/8/4-column layouts, pointer movement and
resizing, staged atomic geometry fields, per-breakpoint locks, recursive
duplication, removal, twenty local undo/redo snapshots and typed content for all
fifteen existing block kinds. Empty generated layouts receive deterministic
placements; invalid supplied placements leave an opening error with Apply
disabled and the original intact. Cancel/discard, invalid fields and rejected
Apply retain clear ownership boundaries. Snapshot records remain read-only.

Composer captures editor/batch/result/original-draft identities. Apply replaces
only the selected current Report within the latest batch, preserving sibling
formats, captured inputs, generation metadata, theme, source manifest, asset IDs
and immutable data snapshots; stale artifact HTML is removed. Guest persistence
uses the existing four-hour store and its actual storage notice. Workspace edits
remain in the current tab.

React preview uses the shared grid geometry, container queries and an optional
explicit editor breakpoint. Scrollable, keyboard-focusable block regions retain
long text, tables and qualifications; source order remains reading order. The
standalone artifact compiler is unchanged and still renders flow layout.
Hosted saving, grid artifact export, publication and new data import/snapshot
creation are not implemented by Apply.

## Focused checks and boundaries

The authored checks execute actual client/schema/helper/guest-store/renderer
source with in-memory storage, UI host/fake-hook substitutions and direct source
callbacks. Composer callbacks are extracted from its actual function declarations
using TypeScript's syntax tree, with authored refs/setters. That proves their
logic under the stated inputs, not React lifecycle or production integration.
ReactDOM and Recharts run only in server rendering; pointer event objects and
capture nodes in the callback cases are authored mocks.

The final combined run passed **96 cases, zero failures/skips/cancellations**:
44 helper/store, 17 editor/history, 10 Composer ownership and 25 Report preview
cases, using Node 24.21.0 and the locked Zod runtime. This run includes the final
fractional numeric-input correction.

The identical 25 preview cases against immutable baseline
`0236c6ad90129e236138e86c471454672a6ed1f5` produced **19 passes and six failures**.
These failures cover absent responsive placements, scroll-region semantics,
container/forced breakpoint rendering, narrative whitespace and omitted link/
image text. The invalid-layout fallback case already passed on the baseline's
flow renderer. Baseline renderer SHA256 is
`3713c823c9a5e24f9c2b29c2167b34cf3da0403b0fab7c42bf5d6646654faa0c`.
The owned temporary baseline was removed after terminal execution. New helper/
editor exports were absent on the baseline; no missing-export failure is claimed
as regression sensitivity.

Read-only existing tooling supplies TypeScript 5.9.3, React/ReactDOM 19.2.3 and
Recharts 2.15.4. The [verified cache loader](../../../../tests/helpers/locked-zod-cache.cjs)
uses the exact locked Zod 4.4.3 archive, checking its package-lock SHA512 and
package/runtime versions before relative CommonJS execution in memory. No local
dependency installation, archive extraction, vendoring or download is needed.
Fixture UUID generation substitutes native randomUUID; UUIDv7 ordering is not
tested. Vitest entries register the same cases but its full suite is unrun.

```sh
IV_TEST_PROJECT_ROOT=/path/to/existing/project \
IV_TEST_ZOD_ENTRY="$PWD/tests/helpers/locked-zod-cache.cjs" \
node --test-reporter=spec --input-type=module - <<'JS'
import test from 'node:test';
import { registerReportAuthoringChecks } from './tests/unit/report-authoring.cases.mjs';
import { registerReportEditorChecks } from './tests/unit/report-editor.cases.mjs';
import { registerReportComposerChecks } from './tests/unit/report-composer.cases.mjs';
import { registerReportPreviewChecks } from './tests/unit/report-preview.cases.mjs';
registerReportAuthoringChecks(test);
registerReportEditorChecks(test);
registerReportComposerChecks(test);
registerReportPreviewChecks(test);
JS
```

Review corrected per-keystroke layout rejection with staged atomic geometry,
NaN/null history conflation with Object.is-based equality, chart-column renaming
with an explicit value-preserving action, and fractional numeric input handling.
Focused cases cover these corrections and cancellation/ownership boundaries.
Independent source review found no remaining concrete blocker. Fourteen changed
TS/TSX files passed syntax transpilation with no diagnostics; this is not a
semantic TypeScript program check. Twenty-eight owned text files, 25 local
Markdown targets and 59 local source imports passed whitespace/path checks.
`git diff --check` passed. The protected
domain/schema, provider/API/Auth, AI/compiler, dependency, storage-contract and
workflow paths compare unchanged against the baseline.

Frozen SHA256 values below use sorted relative path, NUL, bytes, NUL:

| Group | Files | SHA256 |
| --- | --- | --- |
| Changed production source | 11 | `d8681091cac87287b352f32d5aa10746bdf9ee27be1ec51856720bdb2248dae0` |
| Shared cases and Vitest entries | 7 | `62221d0fb2f0bdbb10855c16058f5740645a04c186b3606ac4434a60a425ee49` |
| Inactive browser proposal | 4 | `14bba9bc517b6d721cdf7987708c539129669c65844bf1546b736fc4754fa91c` |

The [eight-check browser proposal](../../../proposals/report-editor-browser.md)
is inactive and outside test discovery/workflows. Its separate approval is
pending; authored callback input does not prove real mouse/touch, focus, viewport
fit or browser storage behavior.

No local install, full Next build, broad TypeScript program, browser, dev server,
backend/provider test, real generation, account or model call ran for this slice.
Domain schemas, provider/API/Auth, AI/compiler, dependencies, storage contracts
and CI configuration are unchanged. Browser acceptance and the existing durable
all-format workflow gates remain unfinished.

## Publication

Source
[`b3c1a2218e6c10653a1ca2a27e98bda0ae9ca7c5`](https://github.com/alvarovillalbaa/intelligent-visualization/commit/b3c1a2218e6c10653a1ca2a27e98bda0ae9ca7c5)
was pushed to personal-repository main. Immutable connected GitHub readback
matches local blobs for ReportEditor (`6bbe7bb0625bf6164afea0f7cc2aa15ea10b29d3`),
the authoring helper (`de8710fdd2d20ae265f9375515015271e4155531`) and Composer
(`967caa476c1c0302a13e745ac5c6da38403da038`). The commit-specific `[skip actions]`
annotation leaves the existing broad backend/provider push workflow unrun; the
SHA/event-filtered Actions API returned zero push runs. Its file is unchanged;
no green GitHub CI result is inferred from that omission.

Vercel production
[`dpl_DYeMCoQge17MWUbpFu4puHraNJJT`](https://vercel.com/my-team-4f230354/intelligent-visualization/DYeMCoQge17MWUbpFu4puHraNJJT)
reached READY at that exact source SHA and owns the canonical alias. Logs show
successful compilation in 11.3 seconds, the TypeScript step, completed build
output and deployment. This is the actual hosted locked-dependency build; local
syntax checks are not substituted for it.

A public [homepage](https://intelligent-visualization.vercel.app/) GET returned
200 and referenced that deployment in its script URLs. The Report editor chunk
`/_next/static/chunks/303-d98ce2af823593e3.js` returned 200: 152,870 bytes,
SHA256 `91729f34fbb56d22c8807cee987bc8ab6094877e29365f76b9103e1e83db7d04`.
Its bytes contain Edit Report, Apply position and size, Discard position fields,
Resize selected block and Source snapshots. This establishes source, hosted
build and delivered client code, not browser interaction. The receipt-only
follow-up keeps all checked runtime, test and proposal bytes unchanged.
