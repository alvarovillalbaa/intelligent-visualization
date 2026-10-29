# Inactive Course export checks

29 October 2026. Source and execution proposal only. No check in this proposal
has run. The supplied AGENTS.md §7 requires backend/domain/browser approval;
§14 requires approval for temporary CI and runner-only tooling. Older Course
editor and Report export scopes do not cover this work.

The [browser specification](course-export-browser.test.ts.example),
[configuration](course-export-browser.config.ts.example) and
[workflow](course-export-browser.yml.example) remain inactive, outside test
discovery and `.github/workflows`.

## Exactly 110 checks in one bounded job

One manual public Ubuntu 24.04 runner, read-only repository access, no retries,
maximum twenty minutes. Node 24.21.0; application dependencies come from the
unchanged committed lock with lifecycle scripts disabled. Runner-only
Playwright 1.58.2 and Chromium live under the task's isolated temporary root.

| Selection | Cases |
| --- | ---: |
| `tests/unit/course-artifact.test.ts` | 20 |
| `tests/unit/course-download.test.ts` | 22 |
| `tests/unit/report-artifact.test.ts` | 64 |
| Two native browser scenarios × desktop/narrow Chromium | 4 |
| **Total** | **110** |

The first two files contain 42 new authored cases. The 64 artifact regressions
include the existing Report checks and exact Slides baseline fingerprints;
two Course cases explicitly test the intentional v1-to-v2 transition while
retaining their original legacy fingerprint values. They do not claim v2 HTML
matches v1. The job selects exactly these three Vitest files, checks every name
and outcome in its JSON report, and requires 106 passes with no skips/TODOs.
No other unit/provider/backend suite is selected.

The new cases use authored documents, actual compiler/download modules, mocked
fetch, bounded response streams and a direct callback/hook model. They check
full Course content, safe anchors/text/CSS boundaries, immutable inputs/hashes,
bounded and aborted preparation, retries, deadline/stale-result ownership,
Object URL cleanup and the explicit prepare/save boundary. This hook model is
not React lifecycle or native-file proof.

Two browser scenarios each run at 1440×1000 desktop and 390×844 mobile emulation:

1. Generate a single authored Course through an intercepted response, call the
   real local artifact route to prepare it, use the native Save link, then open
   only the exact saved file in a separate JavaScript-enabled context. Verify
   learner preparation, objectives, dependencies/citations, glossary/references,
   the six block kinds, wrong/right quiz feedback, recall input and completion.
   Reload must clear runtime-owned quiz feedback and completion. The check does
   not require the browser to disable native form-value restoration.
2. Intercept only the first artifact request with 503, retain the existing
   browser draft, retry against the real local compiler route and save its
   output. The stored snapshot must remain unchanged.

## Request, file and initialization boundary

The application origin is exactly `http://127.0.0.1:3100`. Root/Next-asset/icon
GET/HEAD requests are allowed; generation is fulfilled only for the authored
Course request. Artifact POSTs pass through only for the exact authored Course
document, except the deliberate first 503 in scenario two. Other API calls,
mutations, navigation and external requests are blocked and recorded. The
exact same-origin Blob URL is allowed only for its native download.

Saved files live in newly allocated guarded task directories. The file context
allows only that exact file, with inline Course JavaScript enabled. Recording
tripwires throw on analytics/network calls or persistent storage writes; they
do not pretend those operations succeeded. Each scenario checks the recorded
attempts, route violations and page errors. No reference/CTA link is followed.

Contexts start cookie-free with no origins, and service workers are blocked.
The application modules still initialize existing in-memory demo fixtures,
hashes and strings. Without a session cookie, the existing anonymous session
path returns before repository lookup. The reviewed path reads/writes no
database, filesystem store or provider. This is not a claim that no Auth or
application initialization code executes. Browser interception is not a
Node/server network sandbox and does not fence the Next development WebSocket.

## Activation and cleanup after approval only

Re-review the published source/lock/proposal, then copy only this workflow to
`.github/workflows/course-export-browser.yml`. Activation and removal commits
use the existing `[skip actions]` convention so the broad push workflow remains
unrun. Dispatch the focused workflow once on public personal main. No existing
workflow is edited. This is explicit scope control, not a green broad-CI claim.

The workflow creates one owned `RUNNER_TEMP/iv-course-export-<run>-<attempt>`
root with guarded tool/browser/cache/result/download paths. It refuses to
overwrite existing copied test files. Teardown closes file contexts and removes
native downloads/saved-file directories; always-run cleanup removes only copied
spec/config and that owned root. Runner teardown owns its disposable checkout
and installed application dependencies. Remove the active temporary workflow
after collecting outcomes, including on failure; its read-only runner token
cannot perform repository cleanup.

TAP and structured outcomes are printed in the job log before cleanup, with
exact source and test hashes. Successful commands with missing reports fail.
No reusable cache, artifact upload, screenshots, traces or video is configured.
No deployment, Next production build, database setup, real generation, account,
production data, private source, model call, provider setting, npm publication,
new paid plan or payment is included.

The [pinned Vitest 4.1.9 reporter documentation](https://github.com/vitest-dev/vitest/blob/v4.1.9/docs/guide/reporters.md)
describes TAP/JSON reports; [Playwright's reporter documentation](https://playwright.dev/docs/test-reporters#json-reporter)
describes the structured browser report. Documented options and static parsing
do not establish a working execution; that remains this approval's purpose.

Passing would prove exactly these authored local checks and Chromium-emulated
file interactions. It would not prove physical mobile/printing, all browsers,
anonymous hosted artifact behavior, real generation quality, authenticated
persistence, learner analytics or public Course publication. The full app and
portfolio goal remain unfinished.
