# Composer extraction ownership

28 October 2026. Client repair and focused callback checks are prepared for
publication. Hosted build/delivery and browser interaction are separate proof.

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
