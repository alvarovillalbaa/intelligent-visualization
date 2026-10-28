# Composer extraction ownership

28 October 2026. The client repair is published; its first hosted build is READY.
An existing lint gate exposed further source issues, addressed below. Final CI
and hosted readback are pending at this preparation step; browser interaction
remains separate proof.

## Problem and change

At clean baseline `87ad225b458082e19946019c7e545e0248086639`, Continue with
URL A, Edit/Continue with B, then Edit/Continue with A can overlap three brand
extractions. The first A response matches the newest loading URL and replaces
its theme/markdown; the newest success is then ignored because style is already
ready. An older rejection can similarly mark the latest A unavailable. That
obsolete context enters the captured generation input, contrary to the shared
source/style requirement in [AI generation](../../../ai-generation.md).

The [composer](../../../../components/visualizations/composer.tsx) now owns each
extraction by a distinct controller/timer handle. New extraction, no-URL Continue,
Start over and mount cleanup invalidate ownership before aborting/clearing its
timer. Success and failure check ownership before enqueueing and inside queued
state updates. The handle remains valid after promise cleanup until explicitly
invalidated, so a current queued update can still apply. A current 15-second
timeout exits loading even if a transport ignores abort; aborted late success
cannot restore style. Unchanged-URL Continue retains its loading request or
accepted/shuffled/skipped choice.

React documents [queued state updaters](https://react.dev/reference/react/useState#setstate)
and [cleanup guards for reordered responses](https://react.dev/reference/react/useEffect#fetching-data-with-effects).
The [DOM abort contract](https://dom.spec.whatwg.org/#interface-abortcontroller)
signals cancellation; request identity also protects against completion that
does not observe it. This client repair does not establish cancellation of work
already received by the server/provider.

The brand endpoint, request/response shape, generation transport, provider/model
configuration, persistence, dependencies and existing CI are unchanged.

## Focused evidence

The [28 frontend cases](../../../../tests/unit/composer-extraction.cases.mjs)
AST-extract actual Composer declarations, constants and the mount effect/cleanup.
Authored refs/state, deferred fetch/JSON, fake timers and optionally delayed
functional setters simulate T2 callbacks. Fetch is stubbed and cannot reach an
HTTP route or provider. The existing test pattern loads TypeScript 5.9.3 from an
already available toolchain through `IV_TEST_PROJECT_ROOT`; nothing was installed.

On Node v26.8.2, **28 passed, zero failed/skipped/cancelled/TODO**. The identical
final harness with `IV_EXTRACTION_SOURCE` pointing to a temporary immutable
baseline export produced **12 passes and 16 failures**. The failures exercise
A→B→A obsolete success/rejection/body parsing, replacement/reset/no-URL/unmount,
setup replay, timeout and delayed updater ownership, and captured generation
context. Both runs used the same harness and runtime.

```sh
node --input-type=module -e "import { test } from 'node:test'; import { registerComposerExtractionChecks } from './tests/unit/composer-extraction.cases.mjs'; registerComposerExtractionChecks(test);"
```

The [Vitest entry](../../../../tests/unit/composer-extraction.test.ts) registers
the same cases in the repository's existing suite. Its native CI result will be
recorded after publication. Source parsing reported zero syntax diagnostics and
all 20 local imports resolve. New MJS syntax/newline/whitespace and
`git diff --check` passed. Independent source/caller review found no further
concrete blocker in the repair.

This harness does not execute React scheduling/lifecycle, browser events, real
fetch/body cancellation, native timers or the brand-extraction backend. Existing
browser/AI/provider acceptance proposals retain their separate pending gates.
No local build, server, backend test, browser, dependency install, model call,
database, Auth or configuration change was performed for these checks. This
repair does not complete the application or the broader all-project goal.

## Initial publication and existing lint failure

Source [91ded37](https://github.com/alvarovillalbaa/intelligent-visualization/commit/91ded37d4f5c830dd61231d65cf636e94fb665ac)
was pushed to personal `main`. Immutable GitHub readback matched all five changed
files, including composer blob `10ec7064cecd5327c3d69822468f904778a6d288` and
case blob `97a15e48b00d6cd8be6ffe37322a14eddff421a2`.
Vercel [dpl_GqN1RXBX5YoRdGnhyPvtyqgyz9Rd](https://vercel.com/my-team-4f230354/intelligent-visualization/GqN1RXBX5YoRdGnhyPvtyqgyz9Rd)
reached production READY at that exact SHA. The hosted build completed in
40 seconds. The canonical guest-page fetch returned HTTP 200 and referenced
that deployment. A local curl attempt failed DNS resolution; the connected
Vercel fetch succeeded. No browser or extraction request was performed.

The unchanged existing CI [run 40619886099](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/40619886099),
job `122591071538`, failed lint with 28 errors and 13 warnings on Node 22.23.3.
Typecheck, Vitest, provider checks, export/verify and build were skipped; the
28 new cases did **not** run in native Vitest in this attempt. Every fatal file,
the lockfile and lint configuration have identical Git blobs in the parent.
That verifies unchanged failing source, not a separately executed baseline CI.

## Source fixes for the existing gate

Course local variables named `module` and VM loader locals were renamed without
changing fields, arguments, assertions or wrapper parameters. Test hook-owner
assignments use balanced stacks instead of aliasing `this`. The optional offline
Zod loader retains CommonJS exports and archive-integrity checks; seven built-in
imports use [Node's getBuiltinModule](https://nodejs.org/docs/latest-v22.x/api/process.html#processgetbuiltinmoduleid),
available from Node 22.3, instead of forbidden require imports.

The Report canvas now updates its committed drag-owner ref in a
[layout effect](https://react.dev/reference/react/useLayoutEffect), rather than
during render. Context-bound canvas state clears a proposed ghost when the
document, selection, breakpoint or disabled value changes, including when an
old value returns later. The guarded state adjustment replaces the effect that
synchronously cleared state. Commit cleanup releases the gesture/capture without
setting state; event cancellation still clears the ghost. The Report callback
harness commits layout effects after a completed render and includes abandoned
render and restored-context regressions. This remains an authored hook model,
not React/browser lifecycle acceptance.

After the local-name/helper fixes, 204 existing frontend cases passed with zero
failures/skips/cancellations across Course authoring/editor/preview and Report
artifact/authoring/composer/download. Node 26.8.2 used the existing TypeScript
5.9.3 toolchain, React/DOM 19.2.0 and integrity-verified locked Zod 4.4.3. React
differs from the repository's locked 19.2.3. Actual Recharts was unavailable in
that borrowed toolchain; Report editor/preview/chart-projection execution awaits
the unchanged automatic CI with locked dependencies. No Recharts stub or install
was substituted. All eleven changed test files passed source syntax/whitespace
checks. The existing checks and lint configuration remain enabled and unchanged.

A supplemental focused lint run over the fifteen code/helper/test files used an
already available ESLint 9.39.5 / Next configuration 16.3.4: zero errors, twelve
unused-host-prop warnings. Its React detection assumed the latest version because
the source-only checkout has no installed React. This is a different lint
toolchain from the repository's locked Next 16.1.6; the automatic CI remains the
canonical lint/type/Vitest/build check. No package or configuration was installed
or changed to run this supplemental check.
