# Inactive Report editor browser proposal

Prepared 28 October 2026 (Europe/Madrid).

These four files are a reviewable proposal. No browser, local server, install,
temporary workflow, model request or backend test has run for this proposal.
The supplied AGENTS.md §§7 and 14 require separate explicit approval for these
browser checks, temporary CI activation and runner-only tooling. Earlier Course
or other app approvals do not authorize this scope.

The [specification](report-editor-browser.test.ts.example),
[configuration](report-editor-browser.config.ts.example) and
[workflow](report-editor-browser.yml.example) remain outside test discovery and
`.github/workflows`. The proposed run logs its exact source commit and hashes;
source, lockfile or proposal changes require review before activation.

## Exactly eight checks

Four scenarios run once each in Chromium desktop 1440×1000 and mobile emulation
390×844, with one worker, no retries and no skips:

| Scenario | Acceptance |
| --- | --- |
| Layout controls and history | Generate authored Course + Report through intercepted responses. Move and resize the selected Report block with real mouse input on desktop and Chromium touch input on mobile. Change a position through its keyboard field; verify locks disable geometry controls, duplication creates a fresh ID, undo/redo restore the expected layouts, and only the selected breakpoint changes. Apply preserves the sibling Course. |
| Typed data and nested content | Change chart title, type a decimal numeric value character by character, and edit table cells and nested tab text through typed controls. A text value in a numeric series blocks Apply while keeping fields. Correct it, preview and Apply; chart/table provenance, illustrative flag and immutable data snapshots survive alongside all authored changes. |
| Dismissal, focus and fit | Pristine Cancel returns focus to Edit Report. Dirty Escape offers Keep editing and preserves the field/focus; backdrop dismissal offers explicit Discard changes. Neither writes an unapplied draft. Check dialog/page horizontal fit and representative 44px controls in both projects. |
| Guest persistence and quota | A valid edit round-trips through the existing four-hour browser snapshot and reload without another generation request. Then inject a key-specific Storage.prototype.setItem QuotaExceededError. Another Apply keeps new in-memory content, displays the actual preview storage notice and leaves the previous browser copy byte for byte. Reload restores that previous copy. |

Fixtures use the actual starter document factories, with authored Report chart,
table, tab and layout records and test-only generation metadata. They exercise
the actual GUI, validators, Apply integration and guest store. Mocked generation
does not establish AI quality. Charts use authored values; no real data import or
immutable-snapshot creation flow is exercised.

## Request and data boundary

The browser base URL and Next public app URL are exactly
`http://127.0.0.1:3100`. Every check gets a new cookie-free context and isolated
storage. Service workers are blocked. No account, user data, uploads, workspace
save, publication or external link is used.

The browser route guard fulfills only Course/Report POSTs to
`/api/visualizations/generate`, without forwarding them. Artifact POSTs are also
intercepted; all eight checks expect zero artifact requests and fail if any
occur. Other HTTP mutations, API reads, non-owned navigation and external
origins are aborted and recorded. Only the local root, Next assets and favicon
GET/HEAD requests pass through. Each check asserts no unexpected request or page
error. This guard is not a Node/server network sandbox and does not intercept
Next's local development WebSocket.

AI and hosted features are disabled; provider/database credentials are blank.
Anonymous page rendering returns before repository lookup when no session cookie
exists (`lib/server-auth.ts`). Server modules may load. No backend suite,
database setup/migration, model call or real generation/artifact handler runs.

## Proposed activation and cleanup, only after approval

1. Re-review source, lockfile and these examples. Copy the inactive workflow to
   `.github/workflows/report-editor-browser.yml` on main, using `[skip actions]`
   in that source commit to avoid the existing broad push CI. The new workflow
   has only workflow_dispatch and a public-repository/main guard.
2. Dispatch once: one standard `ubuntu-24.04` job, read-only repository permission
   and a 20-minute cap. Log exact source identity and hashes.
3. Within that disposable runner only, run npm ci from the existing lock with
   lifecycle scripts disabled. Install test-only `@playwright/test@1.58.2` in an
   isolated RUNNER_TEMP prefix and download Chromium plus its Linux dependencies.
   Node is pinned to 24.21.0. Do not modify manifests/lockfiles or create caches,
   screenshots, traces, video or artifact uploads.
4. Copy only these examples to `tests/tmp/report-editor.spec.ts` and
   `tests/tmp/report-editor.config.ts`, preserving the fixture import's relative
   path. NODE_PATH points to the isolated tool prefix. The config discovers only
   that spec, starts local Next dev without reuse and runs its two projects.
   It does not run a build or another test suite.
5. Persist all eight outcomes and source identity in the owning results docs.
   An always-run step removes the exact copied files and guarded runner-owned
   tool/browser/output directory. Remove the active workflow afterward even on
   failure, using `[skip actions]` for that cleanup commit. The read-only runner
   token cannot remove the repository workflow itself.

The pinned actions and [Playwright release](https://github.com/microsoft/playwright/releases/tag/v1.58.2)
are carried from the reviewed [Course proposal](course-editor-browser.md).
This proposal authoring performs no package fetch or installation. No local
browser, build, dependency installation or dev server is requested.

## Proof limits and preparation

Passing would establish these eight authored, mocked-network checks against the
logged source on a local development server. It would not establish hosted QA,
physical mobile input, all browsers, AI/provider quality, authenticated Report
persistence, publication, standalone artifact layout or release readiness.
Chromium touch injection exercises the browser's actual pointer-event path;
it does not emulate a physical device's complete input stack.

Static preparation passed syntax transpilation of both TS examples, copied-path
relative import checks, YAML parsing and scope checks, all six run shell blocks
with bash -n, local Markdown links and whitespace checks. Selectors were reviewed
against the current Report editor, including staged position fields and their
explicit Apply button. This is not Playwright type checking, browser execution
or CI proof. The examples remain inactive pending the owner's approval.
