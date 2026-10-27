# Course draft authoring

27 October 2026. Source implementation and 63 focused checks complete;
publication/build verification pending. The all-project goal is active.

The owning [Course authoring](../../../course-authoring.md) and implementation
plan identified an absent editor. The latest fetched Notion child lists the
existing four QA requests; it adds no new authoring requirement. This slice
implements the repository's planned client editor while the independent
[hosted persistence proposal](../../../proposals/all-formats-persistence.md)
retains its approval gates.

## Behavior and ownership

Eight editor files expose typed fields, all six existing block kinds, hierarchy
and collection editing, isolated preview, explicit dirty discard and validation
errors. Composer captures batch/result/editor identities and the original draft;
Apply merges the selected Course into the latest batch or rejects a stale edit.
Sibling formats and source/provenance/style metadata survive. Preview includes
previously omitted authored fields and announces the current storage notice.
No provider, backend, domain schema, prompt, dependency or CI configuration is
changed. Workspace saving/publication is not implemented by Apply.

## Focused verification

**63 cases passed, zero failures/skips/cancellations**, on Node 24.21.0:

- 46 actual client-helper/batch/guest-store checks: validation bounds, immutable
  Apply, sibling/source preservation, stale drafts, artifact invalidation,
  edited round trips and failed replacement retaining exact previous bytes.
- 11 actual editor SSR/source-callback checks: typed controls/labels, isolated
  changes, cancel/discard, validation/parent callback errors, local preview,
  subtitle clearing, dependency cleanup and answer-option identity.
- Six actual CoursePreview SSR checks: authored metadata, learner preparation,
  feedback/dependencies/references, all six blocks, escaping and empty sections.

The identical six preview cases against immutable source
`f8213b1073cd90b15c6ec7d2459c0c79d6649ca8` produced **two passes/four failures**.
New editor/helper exports did not exist in that baseline; no artificial
missing-export red-suite claim is made.

Tests use authored data (T2), in-memory localStorage, fixture-only UUID
substitution and UI host/fake-hook stubs for direct callbacks. Actual schema,
helper, guest-store and renderer source executes. SSR does not prove native
dialog events, focus, viewport layout or real browser quota handling. Injected
parent Apply errors are not a live persistence check.

Read-only compatible tooling supplies React/ReactDOM 19.2.3 and TypeScript 5.9.3.
Its default Zod is 3.25.76, so final validation instead used the exact locked
**Zod 4.4.3** archive already in npm's cache. The optional
[cache loader](../../../../tests/helpers/locked-zod-cache.cjs) verifies the
package-lock SHA512 and package/runtime versions before relative CommonJS
execution in memory. Nothing is installed, extracted, downloaded or vendored.
Earlier Zod 3 checks are superseded; their types are not locked-version proof.
The three Vitest entries register the same cases but the full suite is unrun.

With a normal IV installation, tests use its dependencies. For a compatible
existing toolchain and the verified cached archive, the same focused cases run:

```sh
IV_TEST_PROJECT_ROOT=/path/to/existing/project \
IV_TEST_ZOD_ENTRY="$PWD/tests/helpers/locked-zod-cache.cjs" \
node --test-reporter=tap --input-type=module - <<'JS'
import test from 'node:test';
import { registerCourseAuthoringChecks } from './tests/unit/course-authoring.cases.mjs';
import { registerCourseEditorChecks } from './tests/unit/course-editor.cases.mjs';
import { registerCoursePreviewChecks } from './tests/unit/course-preview.cases.mjs';
registerCourseAuthoringChecks(test);
registerCourseEditorChecks(test);
registerCoursePreviewChecks(test);
JS
```

Independent source review found no remaining concrete blocker. Narrow syntax,
whitespace, imports and links passed before publication: 16 changed TS/TSX files,
72 local source imports, 25 owned text files and 17 local Markdown targets.
`git diff --check` passed. Domain/schema, provider/backend/API, AI/compiler,
dependencies, guest/batch storage and workflow paths compare unchanged against
the baseline. Frozen editor source SHA256 is
`aedcdfd42820d2b4a9c62e89c0f8a1259a81fb1fc4507f7e3792b50e201d9434`;
helper/cache-loader/case-entry source SHA256 is
`9c3ab9634d49dc46de6e18ccacf8ebe63b1c77727f1b749be5bda5f4699d725f`
(sorted relative paths, NUL, bytes, NUL).

No local install,
full Next build, broad TypeScript program, browser, model, provider or backend
test ran. Hosted build/source delivery will be recorded after publication;
browser acceptance, real generation and durable all-format workflows remain
unverified. Existing generation-check approval requests remain pending.
