# Inactive source input acceptance proposal

This proposal has not installed a workflow or run browser checks. Approval for BeforeLaunch does not cover Intelligent Visualization. The workflow remains a [reviewable example](source-inputs-ci.yml.example), outside `.github/workflows/`.

Approval under the supplied AGENTS.md §7 and §14 is needed for this app's desktop/mobile browser checks, temporary CI activation, dependency installation in the runner, and the runner-only Playwright tool. The repository currently declares Vitest and has `package-lock.json`; it does not declare Playwright. No package manifest or lockfile change is proposed.

After approval, the owner can install the example as `.github/workflows/source-inputs-acceptance.yml` on `qa/source-inputs-acceptance`, publish that temporary branch once, inspect the results, and remove the active workflow afterward. The public-repository, exact-repository, and exact-branch job guards exclude private or unrelated targets. No automatic reruns or retry policy is proposed.

## Exact scope

The job runs on standard `ubuntu-24.04`, with Node `24.21.0`, a 15-minute job timeout, read-only contents permission, and checkout credentials disabled. Checkout and setup-node use the full reviewed commit pins in the example. No cache restore/save, artifact uploads, traces, screenshots, video, accounts, secrets, database services, migrations, or provider provisioning are included.

The proposed checks are:

1. Focused ESLint over [the composer](../../components/visualizations/composer.tsx), [the text helper](../../lib/client/composer-source-input.ts), [guest draft storage](../../lib/client/guest-draft.ts), and [the unit source](../../tests/unit/source-inputs.test.ts).
2. Exactly `vitest run tests/unit/source-inputs.test.ts`: 12 authored frontend cases for legacy CRLF/multiline content, per-entry whitespace and duplicates, pending input, metadata validation, copied entries, and the full/metadata-free/clipped quota fallbacks. No other unit, integration, backend, provider, or generation suites are selected.
3. Exactly the four anonymous browser cases in [the inactive browser source](source-inputs-browser.spec.ts.example), copied to `tests/browser/source-inputs.spec.ts` only inside the disposable runner after tool installation.

| Browser case | Intended acceptance |
| --- | --- |
| Desktop source entry | Add and Enter preserve ordered duplicate entries; removal, pending Continue/Edit, and persisted canonical text agree. |
| Desktop multiline/IME | An explicitly synthetic clipboard event tests selection splicing; composition and repeated Enter guards preserve content across reload. This is not native clipboard permission or OS paste proof. |
| Desktop legacy draft | An authored v2 draft restores multiline legacy text as one source, and later pending text remains available. |
| Mobile source entry | A 390 × 844 Chromium context with touch/mobile emulation uses taps for Add/remove/Continue/Edit, then checks reload and document overflow. This is not physical-device acceptance. |

The single Chromium project allows the browser source's nested desktop/mobile overrides, rather than duplicating all four cases across projects. It uses one worker, zero retries, and a loopback Next development server at `http://127.0.0.1:3100`; it does not test the hosted production deployment.

## Temporary tooling and files

`npm ci --ignore-scripts --no-audit --no-fund` installs the existing lock without lifecycle scripts. The workflow then installs exactly `@playwright/test@1.61.1` under a separate `RUNNER_TEMP` tool prefix using `--no-save --package-lock=false --ignore-scripts --no-audit --no-fund`. This runner-only dependency still requires explicit approval; moving it outside the manifest is not an approval exemption. The prefix install flags follow the [official npm install reference](https://docs.npmjs.com/cli/v11/commands/npm-install).

One task-owned `node_modules/@playwright/test` symlink exposes that exact external tool. The step refuses to replace an existing path and verifies that `package.json` and `package-lock.json` have no diff. Chromium and its Linux libraries are installed only in the disposable runner, following the browser-install step documented by [Playwright CI guidance](https://playwright.dev/docs/ci-intro).

The browser copy, focused Playwright configuration, installed packages, `.next` development output, browser binaries, and result files are runner-local and are not committed or uploaded. Tool, browser, and result paths are derived from `RUNNER_TEMP` in a step and passed through `GITHUB_ENV`; no job-level `runner` context is used for environment values. No database or application storage paths need provisioning for these cases.

## Anonymous path and mutation boundary

The [home page](../../app/page.tsx) calls [getCurrentSessionUser](../../lib/server-auth.ts), which returns `null` when the `slides_session` cookie is absent, before calling `repository.getSessionUser`. The browser cases start with fresh, cookie-free contexts and remain on the guest path. The [root layout](../../app/layout.tsx) uses a local font stack, without a remote font fetch.

Importing that server module still imports the legacy [repository](../../lib/repository.ts) and [demo store](../../lib/demo-store.ts); the latter eagerly creates seed data in memory. The no-cookie path does not invoke repository methods, open the SQLite adapter, create a Convex client, or call the legacy filesystem write methods. This is a source-based bound on the selected guest flow, not a claim that no server modules load.

Provider/model credentials are explicitly blank and AI/agent/workflow features are disabled in the job. No secrets are referenced. The browser source aborts and records non-loopback requests and methods other than GET/HEAD. It uses authored local text without URLs, uploads, sign-in, account creation, brand extraction, or clicking Create. It neither calls generation nor verifies model/provider behavior. Browser request guards do not form a general server network sandbox; dependency and Chromium downloads intentionally need network access.

The local storage fixtures belong only to each disposable browser context. These cases preserve or replace their own `iv:guest-draft:v2` value; they do not inspect user Chrome or production drafts. No database, backend API, model, production, or external-account mutation is authorized by this proposal.

## Cost and evidence limits

GitHub documents standard hosted-runner usage for public repositories as free; the job is guarded to that scope and uses no larger runner. Artifact/cache storage is a separate surface, so this proposal does not upload artifacts or configure persistent caching. This does not assert anything about account billing settings or existing usage. See [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

A future successful run would establish only the selected native Vitest frontend behavior and anonymous Chromium development-server behavior for the logged source commit and hashes. It would not establish hosted production QA, real clipboard/IME input, physical mobile behavior, native file selection, authentication, database/provider operations, model quality, generation, or a complete end-to-end release.

Only source review, YAML/Bash syntax validation, and diff checks apply to these proposal files so far. No workflow commands were executed. No workflow activation, dependency installation, lint/Vitest/browser execution, development server, build, database setup, provider action, or authentication change was performed while preparing them.
