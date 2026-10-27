# Inactive Report export browser proposal

Prepared 28 October 2026 (Europe/Madrid). This proposal has not run.

The supplied AGENTS.md §§7 and 14 require explicit approval for browser checks,
targeted backend checks and temporary CI. This scope exercises the existing
local artifact route, native browser downloads and a saved HTML file. Earlier
Course/Report-editor approvals do not authorize it.

The [specification](report-export-browser.test.ts.example),
[configuration](report-export-browser.config.ts.example) and
[workflow](report-export-browser.yml.example) are inactive, outside discovery
and `.github/workflows`. No browser, server, install, endpoint call or CI
activation occurs while preparing these files.

## Exactly four checks

Two scenarios run in Chromium desktop 1440×1000 and mobile emulation 390×844,
with one worker, no retries or skips:

| Scenario | Acceptance |
| --- | --- |
| Native export and standalone rendering | Generate one authored Report through an intercepted response. Download Report HTML calls the actual local artifact endpoint. Save Report HTML produces a native download with a safe name. Save its exact bytes under the owned runner directory, then open that file in a separate context with page JavaScript disabled. Check 12/8/4-column layouts, keyboard-scrollable cells, all six chart types, full data tables, provenance/illustrative notes, source records/snapshots and print-media flow without clipping. |
| Failed preparation and retry | Intercept only the first artifact preparation with 503. Keep the draft and retry controls intact. Retry reaches the actual local artifact endpoint and exposes a native Save link and safe downloaded filename. Browser snapshot bytes remain unchanged. |

The [actual artifact route](../../app/api/visualizations/artifact/route.ts)
receives only the exact authored Report document. It
validates and compiles that document without database, provider, Auth or schema
changes. Generation is always mocked; no generation handler or model executes.
The download response is real local output, not an HTML fixture.

## Request and file boundary

The application URL is exactly `http://127.0.0.1:3100`. Browser interception
allows root, Next assets and favicon GET/HEAD requests. It fulfills the single
authored generation POST. Artifact POSTs pass only when their body is exactly
the authored Report; scenario two fulfills its first attempt with 503. All
other API, HTTP mutation, non-owned navigation or external requests are blocked
and recorded. Each check asserts no unexpected request or page error.
The exact same-origin Blob URL exposed by Save Report HTML is allowed solely
for that native download; unrelated Blob URLs remain blocked.

Each native download is saved in a newly allocated subdirectory of the guarded
RUNNER_TEMP task root. The file context opens only that exact saved file and
blocks every other HTTP/file request. JavaScript is disabled for page content;
Playwright still reads DOM/computed styles for assertions. The file contains no
script elements. No link or CTA is followed. The route guard is not a Node/server
network sandbox and does not intercept Next's local development WebSocket.

All browser contexts are cookie-free and isolated; service workers are blocked.
AI/hosted features are disabled and provider/database credentials blank. The
anonymous [session path](../../lib/server-auth.ts) returns before repository
lookup without a session cookie.
Application modules still load: the repository import initializes ephemeral
in-memory [demo seed fixtures](../../lib/demo-store.ts), hashes and rendered
strings. The audited path
does not read/write a database, filesystem store or provider service. This is
not a claim that no Auth or application initialization code executes.
No account, real source, production data, upload, database setup, model call,
provider request, hosted publication or paid plan is used.

## Activation and cleanup, only after approval

1. Re-review exact source/lock/proposal bytes, then copy the workflow to
   `.github/workflows/report-export-browser.yml`. Commit with `[skip actions]`
   so the existing broad push workflow stays unrun. Dispatch only on public
   personal-repository main. No existing workflow is edited.
2. Run one standard Ubuntu 24.04 job with read-only repository permission and a
   20-minute cap. Record commit and relevant hashes. Use Node 24.21.0 and the
   existing lock with lifecycle scripts disabled; install runner-only
   Playwright 1.58.2/Chromium and Linux dependencies in isolated task paths.
3. Copy only these two examples into `tests/tmp` and execute their four checks
   against local Next dev. No build or other suite is run. Do not upload output,
   screenshots, traces or video; no reusable cache is configured.
4. After each test, close file contexts and remove native-download temporary
   files and the exact owned saved-file directories. The always-run workflow
   cleanup removes copied examples and the guarded task root, including tool,
   browser, package-cache and output paths. Runner teardown owns the disposable
   checkout and installed application dependencies.
5. Persist all four outcomes and exact source identity in results docs. Remove
   the active workflow even on failure using `[skip actions]`; the runner's
   read-only token cannot perform that repository cleanup.

Pinned actions and the isolated-tool pattern come from the existing reviewed
[Report editor proposal](report-editor-browser.md). Any runtime, lock, source or
proposal change requires review before activation.

## Proof limits

Passing would establish four authored checks against a local server, one local
compiler route and exact downloaded files on that runner. Mobile is Chromium
emulation; print is computed CSS under print media. This does not establish
physical mobile behavior, printer/PDF pagination, all browsers, hosted route
behavior, real generation quality, authenticated persistence, image delivery or
public Report publication. The separate eight-check editor proposal remains
pending and does not include export.

Static preparation passed: both TypeScript examples transpile with zero syntax
diagnostics; the YAML retains manual public-main/read-only/20-minute scope;
all six shell blocks pass `bash -n`; the two-scenario/two-project selection,
three imports from the copied `tests/tmp` path and local Markdown targets resolve.
All four files pass whitespace/newline checks and `git diff --check` passes.
Independent source review found no concrete blocker. This is not a semantic
Playwright typecheck or an executed browser/backend/CI result. The examples
remain inactive pending explicit approval.
