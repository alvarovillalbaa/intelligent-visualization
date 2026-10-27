# Inactive generation batch acceptance proposal

This is a source proposal. It has not installed or activated a workflow, dependency, browser, server, backend test or model call. The [workflow example](batch-ci.yml.example) remains outside .github/workflows, and the [browser source](batch-browser.spec.ts.example) remains outside TypeScript and test discovery. Existing [source-input proposals](source-inputs-checks.md) and [strict AI checks](ai-generation-checks.md) are unchanged.

The supplied AGENTS.md §7 and §14 require explicit approval for this app's browser checks, the 22 mocked backend checks, temporary CI activation and runner-only dependency installation. Earlier BeforeLaunch and Agent Library approvals do not authorize these checks. No account, real generation, provider, deployment or infrastructure mutation is proposed.

After approval, the owner can copy the workflow to .github/workflows/generation-batches-acceptance.yml on the exact temporary branch qa/generation-batches-acceptance, publish it once, inspect that run and remove the active workflow afterward. Re-review any source or selected-case change before activation. The existing automatic CI remains separate; its execution is not approval or evidence for these new browser/backend cases.

## Exactly 54 selected cases

| Selected source | Cases | Scope |
| --- | ---: | --- |
| [Source-input unit tests](../../tests/unit/source-inputs.test.ts) | 12 | Existing exact text, pending input, metadata and quota preservation baseline. |
| [Generation-batch unit tests](../../tests/unit/generation-batch.test.ts) | 14 | Canonical ordering, frozen input, immutable isolated updates, interrupted/uncertain restoration, legacy examples, malformed-batch retention and storage outcomes. |
| [Inactive AI tests](ai-generation.test.ts.example) | 22 | Strict primary generation and artifact contracts with mocked model registry, AI SDK, source fetching and brand application. Copied to tests/proposals/ai-generation.test.ts only in the runner. |
| [Inactive batch browser cases](batch-browser.spec.ts.example) | 6 | Five desktop scenarios and one touch-mobile scenario, described below. Copied to tests/browser/batch.spec.ts only in the runner. |

The 48 native cases run in exactly three selected files, using the existing Vitest dependency and zero retries. The runner validates each file's assertion count and the total. The six Chromium cases run in one selected file/project with one worker, zero retries and no skips. Their JSON count is checked after success. Report fields were checked against the pinned [Vitest 4.1.9 reporter source](https://raw.githubusercontent.com/vitest-dev/vitest/v4.1.9/packages/vitest/src/node/reporters/json.ts) and [Playwright 1.61.1 reporter source](https://raw.githubusercontent.com/microsoft/playwright/v1.61.1/packages/playwright/src/reporters/json.ts). The earlier four source-input browser cases are not selected by this proposal and remain independently inactive.

The 22 backend cases expand four three-kind generation tables to 12, two ordinary generation checks to 2, the two-kind legacy-failure table to 2, the three-kind artifact table to 3, and three ordinary artifact/compiler checks to 3. These are 22 mocked assertions, not 22 real model requests.

| Browser case | Intended acceptance |
| --- | --- |
| Desktop selection | Multiple pressed-state format buttons allow an empty selection with Create disabled; selecting out of order sends exactly Slides/Course/Report in canonical order. The original introduction is visible on source entry and absent on configuration. |
| Partial failure | A delayed Slides response allows same-task synthetic double activation to exercise the synchronous guard. Course fails once, Report still completes, and editing current source/selection does not change the failed Course retry's frozen input or completed siblings. |
| Restored interruption | An authored v2 batch with completed/running/queued results restores unfinished results as interrupted, including after reload, without automatic generation. Only the selected retry runs. Canonical-only restored Slides use the document compilation fallback. |
| Per-kind previews | A mocked compile failure has a preview-only retry. The real pure rich Slides renderer supplies the mocked HTML; its poll updates local preview state without analytics. Rich source takes precedence over canonical document compilation. Course quiz feedback and Report content use their existing React previews. |
| Late file response | Three authored file-context responses are held inside the HTTP harness. Start over invalidates the old response; two current imports remain independent, the attach button stays pending until both settle, and only current files persist. |
| Mobile flow | A fresh 390 × 844 touch Chromium context selects Course and Report, checks 44-pixel format/Create/Preview controls, uses both previews, reloads completed results without auto-calls and checks document horizontal overflow. |

The same-task double activation is synthetic; it is not physical double-tap timing proof. File inputs receive authored in-memory text fixtures through Playwright; this does not test a native OS file picker, document parsing or extraction services. Mobile emulation is not physical-device acceptance. No screenshot, video, trace or visual pixel comparison is proposed.

## Disposable runner and request boundary

The job is limited to the exact public repository alvarovillalbaa/intelligent-visualization and exact temporary branch. It uses standard ubuntu-24.04, a 15-minute job deadline, Node 24.21.0, read-only contents permission and checkout credentials disabled. Checkout and setup-node retain the reviewed full commit pins from the earlier example. There are no cache, artifact, secret, environment, database-service or deployment references.

The existing package-lock is installed with npm ci --ignore-scripts --no-audit --no-fund. Exactly @playwright/test 1.61.1 is installed with --no-save --package-lock=false --ignore-scripts under a separate RUNNER_TEMP prefix. One task-owned symlink exposes it; the step refuses to replace an existing tool path and verifies that the repository manifest and lock are unchanged. This installation still needs explicit approval. Chromium and its Linux libraries are installed only in the disposable runner. See [npm install](https://docs.npmjs.com/cli/v11/commands/npm-install) and [Playwright CI guidance](https://playwright.dev/docs/ci-intro).

Tooling, Chromium, JSON reports and browser output remain in RUNNER_TEMP. The copied tests, temporary Playwright configuration and Next development output remain in the disposable checkout. No outputs are uploaded. The job logs the source commit and SHA-256 digests of selected production/test/proposal files; those identify what ran and do not replace runtime assertions.

The browser uses one Chromium project with nested desktop/mobile overrides, not duplicate projects. Its local Next development server binds 127.0.0.1:3100, with no reused server. Per-case timeout is 60 seconds, the browser global timeout is six minutes and server readiness is bounded to two minutes. No production URL or user browser is opened.

All contexts start cookie-free. The anonymous no-cookie page path returns before repository calls, as bounded in the [existing source-input proposal](source-inputs-checks.md#anonymous-path-and-mutation-boundary). Imported legacy modules can still create their documented in-memory seeds; this is not a claim that no server modules load.

Provider, database and hosted Auth credentials are explicitly blank. AI, Eve and workflow features are disabled. The 22 direct backend cases mock provider resolution, model output, source context and brand application before imports; no real model, source-fetch or repository adapter is exercised.

The browser HTTP harness fulfills only these authored POST responses:

- /api/visualizations/generate: one fixture result or authored safe failure per selected kind.
- /api/visualizations/artifact: pure preview HTML compiled in the test process from authored documents or rich Slides source.
- /api/file-context: delayed authored file metadata and content for the reset race.

Those requests are recorded and never forwarded to the server. All other methods beyond GET/HEAD, all unmocked API reads and every non-owned origin are aborted and recorded; each case asserts zero unexpected requests. No signup, login, workspace save, publication, extraction or analytics endpoint is allowed. No authored CTA is followed. The harness is not a general Node/server network sandbox, and dependency/browser installation intentionally downloads packages.

The rich Slides preview uses production buildStandaloneDeckHtml with preview enabled, its actual local poll runtime and the frontend's CSP plus opaque allow-scripts iframe sandbox. Canonical-only Slides use the existing pure document compiler with preview enabled. These fixtures do not claim canonical Slides image/chart rendering parity with the rich renderer.

## Cost and proof limits

The job is guarded to a public repository and standard hosted Ubuntu runner. GitHub documents that scope as free; this example adds no persistent cache or artifact uploads. This is not a statement about account settings or unrelated usage. See [GitHub billing and usage](https://docs.github.com/en/actions/concepts/billing-and-usage) and the [standard public runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners), which includes ubuntu-24.04. These primary pages, npm installation flags, Playwright CI guidance and the pinned reporter sources above were read on 2026-10-27.

A future successful run would establish only these 54 selected mocked/native/anonymous development-server cases for its logged source commit. It would not establish real AI quality or availability, provider connectivity, model cost, hosted production acceptance, physical mobile behavior, native file selection, authenticated all-kind persistence, publication or a complete release.

Course and Report workspace saving remains explicitly pending the [all-formats persistence design](all-formats-persistence.md). The browser suite remains guest-only and cannot close that gate. No owner-deferred Convex capacity, login, Auth, signing or production configuration choice is changed.

Preparation on 2026-10-27 passed exact browser-source parsing with TypeScript 5.9.3 under Node 24.21.0, YAML structure/safety checks, all nine embedded Bash blocks with bash -n, compilation of five inline JavaScript snippets without executing them, one temporary TypeScript configuration parse, local reference checks and whitespace/diff review. Static syntax-tree counting confirms 12 + 14 + 22 native cases and six browser cases. This is not Playwright typechecking or runtime proof; the runner-only package has not been installed. None of the proposed test, install, server, workflow or browser commands has been executed during preparation.
