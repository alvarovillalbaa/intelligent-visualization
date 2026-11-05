# Course export browser v2 — desktop completion prepared

Last updated: 2026-11-06

## Current 17-minute completion plan

The [second attempt](../results/2026/11-05/course-export-browser-attempt-2.md)
also failed the desktop request boundary, after completing its functional
assertions. Its observer recorded `GET /__nextjs_font/geist-latin.woff2`.
The linked pinned Next 16.1.6 sources identify that exact loopback asset as a
bundled development font, rather than a model/Auth API or external font request.
The checker correction permits only GET/HEAD for that path without a query;
other unknown requests still fail. Standalone-file guards, original bodies
and assertions remain unchanged. Attempt 1's unrecorded URL remains unknown.

Both failed receipts remain immutable. The [second raw report](../results/2026/11-05/course-export-browser-attempt-2.json)
is 378,015 bytes, SHA256
`8e4fc3fb4b4e488b2b0e13bac3b7591f41299b026f4d1f1f71cc72f30ed04a09`;
it grants no additional acceptance. Only desktop native-file completion is
selected again. The other three pairs retain their first-run evidence, subject
to the same pinned-report and 238-input runtime-equivalence checks.

The [inactive example](course-export-browser-v2.yml.example) now allows 17 minutes:
900 seconds work, 90 cleanup and 2 stdout. Browser child/global/minimum remaining
limits stay 300/240/307 seconds. The two jobs used 141 seconds; 141 + 1020 = 1161,
below the original 1200-second allowance. Desktop acceptance remains open.

## First failure and 18-minute completion plan — retained history

The [first attempt](../results/2026/11-05/course-export-browser-attempt-1.json)
failed overall. Its immutable 381,031-byte receipt has SHA256
`ab30f778d525bf738e355bb2cd55957937eac3af595d0882bc1d9216333f155c`.
Desktop retry and both mobile pairs passed once. Desktop native-file assertions
completed, but its strict boundary recorded one unexpected local request;
the method/path was not retained, so its cause is unproven. This is not a
four-pass invocation.

The completion job selects **only desktop's first title below**. The observer
adds method and pathname diagnostics without query strings; unknown requests
remain blocked and fail acceptance. The other three pairs are carried only
from the pinned raw Playwright report, after validating its complete streams,
passing boundaries/cleanup and exact equivalence of all 238 runtime inputs.
No accepted pair or old unit suite is rerun; all original bodies remain intact.

The same pinned-source QA workflow now has an 18-minute ceiling: 960 seconds
work, 90 cleanup, 2 stdout; browser child 300 seconds, Playwright global 240,
minimum remaining window 307. The first job's 75 seconds plus 1080 seconds is
1155, below the original 1200-second allowance. No desktop completion result
is claimed yet. The original preparation below is retained history; the
[inactive example](course-export-browser-v2.yml.example) now describes completion.

## Original four-case preparation — retained history

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
