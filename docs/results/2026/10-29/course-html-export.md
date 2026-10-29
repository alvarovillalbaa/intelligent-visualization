# Course HTML export source and delivery

29 October 2026. In progress; no new test, browser or backend acceptance is
claimed by this source preparation receipt.

At clean personal main `a13dfb2d49c226aea9d91329a57f2d8e99529dcb`, the README
promises standalone HTML for all three visualization types. Course authoring and
its React preview expose preparation, learner context, lesson dependencies and
feedback, glossary and references, but the compiler drops those fields and
the preview provides an HTML download only for Reports.

The [owning export contract](../../../course-export.md) completes that missing
source flow: a distinct Course v2 renderer, committed-draft preparation through
the existing preview artifact route, then an explicit native save link. Report
and Slides retain their existing rendering branches and versions. Their route,
provider, persistence, schema, dependencies and authorization settings are
unchanged. New safe anchors separate HTML identity from authored record IDs.

The two old Course-v1 fingerprint cases in the Report artifact harness retain
their immutable baseline values but now assert the intentional v2 transition,
document/output hash integrity and deterministic repeated compilation. Slides'
exact legacy fingerprint assertions remain unchanged. New focused Course cases
cover the detailed v2 content. No new golden hash was invented or produced by
an unapproved compiler run.

Storage Guard returned exit 2: 24.9 GiB free versus 34.0 GiB required, including
the 30 GiB reserve. No local install or build was attempted. Source-only parsing
may read an existing compatible TypeScript environment without emitting output;
it is distinct from compiler, backend, browser or native-file execution.

The existing broad push CI includes database/provider setup and tests. Source
publication uses the repository's existing `[skip actions]` convention to leave
that unapproved scope unexecuted; no workflow or test configuration is disabled
or modified. The prepared focused job remains outside `.github/workflows` and
requires the supplied AGENTS.md §§7/14 approval before activation.

Static source preparation passed using Node 24.21.0 and the existing borrowed
TypeScript 5.9.3: twelve changed/new source/example files parse, 25 local imports
resolve, two inline Course runtime scripts pass JavaScript parsing, Course CSS
parses and thirty local Markdown links resolve. No files were emitted and no
product module or compiler function was imported/executed. The nine shared
Report/Slides rendering/runtime/CSS helpers match the base source byte for byte.

Ruby/Psych parses the inactive workflow; all eight shell bodies and seven inline
Node programs pass syntax parsing. Independent peer review found no further
source-critical renderer, client or runner-scope blocker. Source-only checks do
not establish a semantic Playwright typecheck or a working execution.

The [preparation fingerprint](course-html-export-source.json) freezes 43 inputs,
all 42 new case names, protected-input equality and the exact 106-unit/four-
browser proposal. Its thirteen protected dependency/schema/route/Auth/Report/
workflow inputs match the inspected base. Dated delivery receipts are excluded
from this seal. All new cases remain unexecuted; no golden was regenerated.

## Published source and hosted build

Source
[`73295ee5bbcd02de0857de39919cbb864e171107`](https://github.com/alvarovillalbaa/intelligent-visualization/commit/73295ee5bbcd02de0857de39919cbb864e171107)
is published on personal main. All 428 local/remote leaf paths, modes, types and
blob SHAs matched without truncation, with a clean checkout. The connector's
tree-root metadata repeated the commit SHA rather than the local tree object,
so it was not used as a Merkle proof; direct exhaustive leaf comparison passed.
The commit-specific workflow-run readback returned zero runs. This is not a
green broad-CI result.

Vercel production
[`dpl_2ZQiMxP7EqDxTUcPpWPUFp6Ls4ax`](https://vercel.com/my-team-4f230354/intelligent-visualization/2ZQiMxP7EqDxTUcPpWPUFp6Ls4ax)
reached READY at that exact commit, with the canonical
[guest page](https://intelligent-visualization.vercel.app/) among its aliases.
The existing Next.js 16.1.6 webpack build compiled successfully, completed its
TypeScript step, generated 15/15 static pages and completed deployment. The
build log reports 36 seconds in `/vercel/output`. No configuration or dependency
was changed to obtain this build.

Connected root GET returned 200 and references that deployment in its assets.
Its delivered Course client chunk
`/_next/static/chunks/791-7639c44a45abae92.js` returned 200: connector-decoded
UTF-8 size 171,373 bytes, SHA256
`3055bee12576907f8e6b67c9186148ffcfebb0c1fc5bc0d195bb1ea0c7d168af`.
JavaScript syntax parsing passed; readback contains the prepare/save controls,
finite response/deadline feedback and Object-URL/monotonic-clock guards. The
owned temporary copy was removed after digest and syntax verification. It was
never executed. Connected fetch may use a temporary share link; this does not
establish independent anonymous browser acceptance.

The [hosted machine record](course-html-export-hosted.json) preserves source,
deployment, build and delivery evidence. The exact 110-check proposal was
published and approval requested; its workflow remains inactive and every new
case unexecuted. No artifact endpoint POST, native download/file opening,
browser, local build or CI job ran. Hosted/provider persistence acceptance and
the full portfolio goal remain unfinished.
