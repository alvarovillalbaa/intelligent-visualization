# Course draft authoring

27 October 2026 (UTC). Source published, 63 focused checks passed, and hosted
build/delivery verified. Browser acceptance remains pending. The all-project
goal is active.

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
test ran. Browser acceptance, real generation and durable all-format workflows
remain unverified. Existing generation-check approval requests remain pending.

## Publication and hosted proof

Source
[`58d21fdf346538d74660a6473684c55f39be55f0`](https://github.com/alvarovillalbaa/intelligent-visualization/commit/58d21fdf346538d74660a6473684c55f39be55f0)
was pushed to personal-repository `main`. Immutable connected GitHub readback
matches local blobs for CourseEditor (`ca8cf08c71768c82e12b58bc7a4e3c3080d936d9`),
the authoring helper (`7693937aa8695c34ac70704fccacb4e19b23d297`) and Composer
(`0710f7f1974f7cc48ad01713cdcab07ba586f3c5`).

The commit-specific `[skip actions]` annotation leaves the broad backend/provider
workflow unrun; its file is unchanged. The SHA/event-filtered Actions API
returned zero push runs. No green GitHub CI claim is made.

Vercel production
[`dpl_9rEY2epv61sazMVHVnWnCDFpyYx7`](https://vercel.com/my-team-4f230354/intelligent-visualization/9rEY2epv61sazMVHVnWnCDFpyYx7)
is READY at that exact source SHA. Logs confirm successful compilation, a
TypeScript step, completed build output and deployment. This is the actual
locked-dependency hosted build; the earlier borrowed-toolchain semantic checks
are not substituted for it. The canonical alias lookup identifies the same
deployment. Public homepage and client chunk requests returned 200.

The served editor chunk `447-acb9e0b4c7e0f042.js` contains Edit Course, Apply
changes, Preview draft, Discard changes, original-generation provenance and
storage-warning code. Its SHA256 is
`9a452c40067a54410e2201a4182149892ac3b79e6d951c36be30072c4774973e`.
Six checked client chunks totalled under 1 MiB; source/delivery inspection is not
rendered browser proof. The default-range connected runtime-error query returned
no errors, without establishing browser telemetry or continuous monitoring.
Task-owned public downloads and baseline copies were removed after inspection.
A docs/proposal-only follow-up can redeploy these same runtime/test bytes.

The [six-check browser proposal](../../../proposals/course-editor-browser.md)
is prepared on 28 October local time with an exact inactive spec/config/workflow.
Its TS syntax, YAML, embedded shell syntax, paths and selectors were reviewed;
the browser checks and runner have not executed. Approval is required by the
supplied AGENTS.md sections 7 and 14. This new authoring scope does not consume
or replace the separately pending generation-check proposal.
