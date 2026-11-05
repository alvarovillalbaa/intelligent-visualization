# Course export browser v2 — prepared, unrun

Last updated: 2026-11-05

Standing “I approve everything” / “Do all the work” covers this focused packet.
The [original proposal](course-export-browser.md), browser examples and historic
receipts remain unchanged. This v2 selects **four existing browser identities
only**; it does not rerun the old 106-unit selection or normal application CI.
No browser result is claimed by this preparation.

One public `alvarovillalbaa/intelligent-visualization` job uses Ubuntu 24.04,
Node 24.21.0 and runner-only Playwright 1.64.1, with a 20-minute ceiling.
The owned QA ref is `qa/iv-course-export-20261105`; checkout is pinned to a clean
preparation SHA before activation. The [inactive workflow](course-export-browser-v2.yml.example)
invokes `node scripts/course-export-browser-controller.mjs --source-commit <SHA>`
with `IV_COURSE_PUBLIC_REPOSITORY=true`. Work, cleanup and final stdout bounds
are 1020, 90 and 2 seconds. No local installation, build or browser execution
is part of this preparation. The browser child has 660 seconds, requires at
least 667 seconds remaining and retains a 600-second Playwright global limit.

## Exact selection

The [v2 specification](course-export-browser-v2.test.ts.example) preserves the
two original scenario titles, fixture and body assertions. Each runs once in
desktop Chromium at 1440×1000 and mobile Chromium at 390×844 with emulated touch:

1. `native Course HTML export retains authored content and its local interactive runtime across a file reload`
2. `failed Course preparation preserves the stored draft and Retry calls the real local artifact route`

The first journey uses authored generation, the actual local artifact route,
the explicit Save link and a real downloaded HTML file. It opens only that saved
file, checks learner content, dependencies/citations, glossary/references, quiz
feedback, recall and completion, then reloads. Runtime-owned feedback/completion
reset; native browser form restoration is a separate behavior. The second
journey deliberately returns one artifact 503, retains the stored draft and
retries against the actual compiler route before saving. Generation is an
authored intercepted response in both journeys, not an actual model call.

## Server, file and source boundaries

The controller exports the guarded application inputs into its fresh owned
scratch root. It installs the frozen application lock there with
`npm ci --ignore-scripts --no-audit --no-fund`; Playwright and Chromium live in
separate owned tooling paths. No dependency, lock or existing CI change is
included. The controller owns one Next development server on
`http://127.0.0.1:3100`; the v2 configuration has no independently owned
`webServer`. This is development-server acceptance, not a production build or
hosted-service check.

Application requests are bounded to the reviewed loopback resources, the exact
authored generation response and artifact document, plus the deliberate 503.
The guest-draft storage writes are intentional. Saved-file contexts permit only
their exact file and inline Course runtime; network/analytics/storage tripwires
record attempts and fail rather than provide fake successful adapters. These
browser guards do not establish an OS or Node network sandbox. Only the owned
loopback development HMR WebSocket is permitted and recorded; it is separate
from standalone-file behavior. No reference link is followed.

Every tracked checkout input, including the permanent broad workflow, remains
under HEAD/index/path/mode/blob/working-byte guards. Exported inputs and owned
generated paths are recorded separately. Require exactly the four expected
title/profile pairs, one passed result each, retry zero, actual CLI exit zero,
no global/page/boundary errors and verified cleanup. Missing or malformed
reports fail. Retain bounded original command/report bytes and hashes, actual
outcomes, source vectors and process/resource closure. Downloads, file contexts,
server, browser groups and scratch paths must close under their owned identities;
uncertain residue is reported, not silently treated as removed.

## Publication and limits

Main preparation and retirement retain `[skip actions]`; the permanent
`.github/workflows/ci.yml` is preserved. GitHub's [skip directive](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs)
applies to push/PR events, so focused activation must use the separately chosen
QA push **without** that skip marker. The broad workflow's push trigger remains
main-only; its pull-request trigger also remains unchanged. No dispatch or broad
check is claimed. Remove the temporary
`.github/workflows/course-export-browser.yml` after collecting the actual result,
including failure.

No full build, unit/provider suite, database setup, production HTTP, account,
private corpus, model/inference call, public Course publication or paid resource
is included.
Passing would cover these four authored Chromium download/file journeys only.
Physical touch, printing, other browsers, real generation, authenticated or
hosted persistence, learner analytics and full product acceptance remain open.
