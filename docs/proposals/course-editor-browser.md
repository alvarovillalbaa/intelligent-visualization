# Inactive Course editor browser proposal

Prepared 28 October 2026 (Europe/Madrid).

These four files are a reviewable proposal. No browser, local server, install,
temporary workflow, model request or backend test has run for this proposal.
The supplied AGENTS.md §§7 and 14 require separate explicit approval for these
browser checks, temporary CI activation and runner-only tooling. Earlier app
approvals and the other inactive batch proposals do not authorize this scope.

The source under review is `58d21fdf346538d74660a6473684c55f39be55f0`.
The [specification](course-editor-browser.test.ts.example),
[configuration](course-editor-browser.config.ts.example) and
[workflow](course-editor-browser.yml.example) remain outside test discovery and
`.github/workflows`. Production/editor/helper source and existing CI are unchanged.

## Exactly six checks

Three scenarios run once each in Chromium desktop 1440×1000 and mobile emulation
390×844, with one worker, no retries and no skips:

| Scenario | Acceptance |
| --- | --- |
| Typed edit, preview, Apply and reload | Generate Course + Report through intercepted authored responses. Edit title/subtitle/feedback/prose, add a heading, edit/reorder/add question options, and preview without applying. Apply updates only Course. Check unchanged Report, theme and source manifest; the existing snapshot has exactly four hours between savedAt and expiresAt, and reload restores edited content without another generation request. |
| Cancel and dirty dismissal | Pristine Cancel returns focus to Edit Course. Dirty Escape offers Keep editing; the title remains and focus returns to that field. A backdrop press offers explicit Discard changes; the original remains unchanged. Check dialog/page horizontal fit and representative 44px controls in both projects. |
| Validation and quota failure | Removing the correct choice blocks Apply until another answer is chosen. Zero lesson minutes also blocks Apply. After an initial durable fixture exists, inject a key-specific Storage.prototype.setItem QuotaExceededError. Valid Apply keeps the new in-memory Course, shows the actual preview storage notice, and preserves the previous browser copy byte for byte. Reload restores that previous copy. |

Fixtures come from the actual starter document factories with authored content
and test-only generation metadata. They test the real GUI, validators, Apply
integration and guest storage; mocked generation is not AI quality evidence.
The sibling Report is a small authored heading rather than a chart workload.

## Request and data boundary

The browser base URL and Next public app URL are exactly
`http://127.0.0.1:3100`. Each check gets a new cookie-free context and isolated
storage. Service workers are blocked. No account, real user data, uploaded files,
workspace save, publication or external link is used.

The browser route guard fulfills only Course/Report POSTs to
`/api/visualizations/generate`, and never forwards them. Artifact POSTs are also
intercepted; these Course/Report scenarios expect zero artifact requests and
fail if any occur. All other HTTP mutations, API reads, non-owned navigation and
external origins are aborted and recorded. Only the local root, Next assets and
favicon GET/HEAD requests pass through. Every check asserts no unexpected
requests or page errors. The HTTP guard is not a Node/server network sandbox and
does not intercept Next's local development WebSocket.

AI and hosted features are disabled; provider/database credentials are blank.
The anonymous page returns before repository lookups when there is no session
cookie (`lib/server-auth.ts`). Server modules can load; this is not a promise
that no server code is imported. There are no backend test suites, database
setup/migrations, model calls or real generation/artifact API handler calls.

## Proposed activation and cleanup, only after approval

1. Re-review any change to the tested UI/helpers, lockfile or proposal. Copy the
   workflow to `.github/workflows/course-editor-browser.yml` on main and use
   `[skip actions]` in that source commit to avoid the existing broad push CI.
   The new workflow has only workflow_dispatch and a public-repository/main guard.
2. Dispatch it once. It has one standard `ubuntu-24.04` job, read-only repository
   permission and a 20-minute limit. It logs the actual source commit and hashes.
3. Only inside that disposable runner, run npm ci from the existing lock with
   lifecycle scripts disabled; install pinned test-only `@playwright/test@1.58.2`
   in a separate RUNNER_TEMP prefix, then download only Chromium and its Linux
   dependencies. Node is pinned to 24.21.0. No package manifest/lock changes,
   persistent caches, screenshots, video, traces or artifact uploads are proposed.
4. The runner copies the spec to `tests/tmp/course-editor.spec.ts` and config to
   `tests/tmp/course-editor.config.ts`; their paths preserve the spec's
   `../../packages/domain/fixtures` import. NODE_PATH points to the isolated tool
   prefix. The config discovers only that spec, starts local Next dev without
   server reuse, and runs its two projects. It never runs builds or other tests.
5. Record the six outcomes and source identity in the owning results docs. An
   always-run step removes the two exact copied files and the guarded temporary
   tool/browser/output directory. Remove the active workflow afterward even if
   the run fails, using `[skip actions]` for that cleanup commit as well. The
   workflow's read-only token cannot perform that repository cleanup itself.

The pinned [Playwright release](https://github.com/microsoft/playwright/releases/tag/v1.58.2)
was checked against its official release. The pinned checkout/setup-node actions
were verified in their public repositories and both use Node 24. This proposal
authoring performs no package fetch or installation.
No local browser, dependency installation, build or dev server is requested.

## Proof limits and preparation

Passing would establish these six authored, mocked-network checks against the
logged source using a local development server. It would not establish hosted
production QA, physical mobile input, AI quality, provider availability,
authenticated Course persistence, publication or release readiness.

Static preparation passed syntax transpilation of both TS examples, copied-path
relative import checks, YAML parsing and scope checks, all six embedded shell
blocks with bash -n, local link checks and whitespace review. It is not Playwright
type checking, browser execution or CI proof. The examples remain inactive
pending the owner's approval.
