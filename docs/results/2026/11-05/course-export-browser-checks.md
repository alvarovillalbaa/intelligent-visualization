# Course HTML download and learner-file acceptance

6 November local / 5 November UTC, 2026. **Four existing title/profile pairs
are accepted across three executions.** Three came from the first run; the
desktop native-file pair passed in the third. No single four-pass invocation
or accepted-pair rerun is claimed. Both earlier failures remain unchanged.

## Actual outcomes and editions

| Pair | Accepted source/run | Observed behavior |
| --- | --- | --- |
| Desktop native file/runtime | `a684ada8` / `42131239553` | Actual local artifact compilation, explicit Save link and browser download; reopened exact file, learner content/citations/dependencies, wrong/right quiz feedback, recall and completion. Reload cleared runtime-owned feedback/completion. |
| Mobile native file/runtime | `bc13c7c2` / `42128567312` | Same original assertions at 390×844 with emulated touch. |
| Desktop retry | `bc13c7c2` / `42128567312` | One controlled artifact 503, visible retry and subsequent actual compiler/download; stored browser draft remained byte-identical. |
| Mobile retry | `bc13c7c2` / `42128567312` | Same retry/draft assertions with emulated touch. |

Generation in every journey is an explicitly authored intercepted response.
The local artifact endpoint, its preview compiler output and subsequent file
interactions are actual. The browser Download API saved the output into owned
directories. No OS save-dialog UI, model generation or hosted Course publication
was exercised.

Every accepted download was **9,743 bytes**, SHA256
`f1f9924916bfe7f130fae6ff4f4ab26d2c62025d533e71168605e00e553553ab`,
with safe filename `course-authored-course-resume.html`. Both native-file
journeys opened only that exact file, observed two loads and reset completion
to `aria-pressed=false`. The original 3,168-byte fixture and 6,286-byte two-test
body/assertion region stayed byte-identical. No application, package, lock or
permanent CI code was changed by this packet.

## Current completion and preserved failures

Checked completion source
[`a684ada8c7331800ca648715ea903bc7d4e6b597`](https://github.com/alvarovillalbaa/intelligent-visualization/tree/a684ada8c7331800ca648715ea903bc7d4e6b597),
tree `0742b3ae945d865a74830c7b0fabce3f80ca3a19`: 465 files / 4,399,156 bytes,
matched clean native HEAD/index/working bytes and immutable GitHub input before
activation. [Run 42131239553](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/42131239553),
job `127608091065`, ran **23:41:00–23:42:13 UTC**, 73 seconds; controller work
was **23:41:08.903–23:42:09.516 UTC**. Only the previously failed desktop pair
was selected: one passed result, retry zero, no global errors, skips or flaky outcomes.

The [first failure](course-export-browser-attempt-1.md) preserved three passes
and one desktop boundary failure with an unrecorded request identity. Its
secondary decoder also encountered an already-removed error-context file;
the full primary Playwright report was captured first and remains available.
The [second failure](course-export-browser-attempt-2.md) reran only desktop and
identified `GET /__nextjs_font/geist-latin.woff2`. That observation does not
retroactively identify the first run's unknown request.

Pinned Next 16.1.6 [styles](https://github.com/vercel/next.js/blob/v16.1.6/packages/next/src/next-devtools/dev-overlay/font/font-styles.tsx)
and [middleware](https://github.com/vercel/next.js/blob/v16.1.6/packages/next/src/next-devtools/server/font/get-dev-overlay-font-middleware.ts)
show the exact path is its bundled local development-overlay font. The checker
now permits only query-free GET/HEAD reads for that asset in the application
context. Other unknown requests still fail; the standalone context retains
every original network/storage tripwire. This is a harness correction, not a
production Course bug fix. Secondary missing diagnostics are explicitly marked
unretained without discarding primary results.

## Independent source and raw evidence

The [current JSON](course-export-browser-checks.json) is **425,993 bytes**,
SHA256 `96fb8fa2000fd4d42a49ab8efdfb9f3478f47e205285c3bbea95087116c37c11`.
It is exact emitted JSON plus one LF; emitted JSON was 425,992 bytes, SHA256
`474aca9ff0e8c46070dd0eca133ade905e440f328e507eebd13fc7d5e5406fbe`.
Current raw Playwright JSON was 6,472 bytes, SHA256
`5f8801b5f02cf3fcc3e98d24b3ff639b0f34e803be3ac0df2d803ba240658f15`.

Root and a second agent independently decoded all **74 current original command
streams / 198 across the three attempts**, plus all three raw Playwright reports.
Compressed sizes, original counts and SHA256 matched. Current 37 commands
exited zero with reaping, close, both pipe EOFs and original-group absence.
The Next server's intentional graceful SIGTERM/exit zero is qualified separately
from foreground commands, which require exit zero without a stop reason.

Five current full source guards protect every path/mode/Git blob/working byte,
with no ignored/untracked output. All three editions exported exactly the same
**238 runtime inputs / 1,957,569 bytes**, verified before tools, after frozen
npm installation and after work. Only that bounded runtime subset was copied;
Git history, docs, earlier evidence and existing dependencies were not copied.
The historical carry revalidates the first report's full raw/closure evidence
and strict passed boundaries, then requires exact current runtime equivalence.
The failed desktop cases are excluded from carried acceptance.

Actual Node 24.21.0, Next 16.1.6, React 19.2.3, TypeScript 5.9.3 and runner-only
Playwright 1.64.1 were recorded. The 207,474,000-byte headless-shell ELF, SHA256
`4fa61f0ba0b4f89b7bec242c32ca16d3bccf69dbfef0651924a9ba8fede5f9d6`,
resolved against preinstalled libraries; actual browser launch was required.
Frozen npm install disabled lifecycle scripts. No apt/sudo, production build,
old 106-unit selection, repeated 474-case CI or local install/server/browser occurred.

## Ownership, publication and limits

Application reads, the authored generation response and exact artifact payloads
were constrained. Local HMR is an explicit development transport exception.
File contexts allowed only their exact owned file; throwing tripwires recorded
network/analytics/storage attempts rather than simulating successful writes.
This instrumentation and browser routing do not establish an OS/Node network
sandbox or unrestricted-file/offline acceptance.

All 18 attributed current PID identities disappeared without supplementary
cleanup signals or uncertainty. Port 3100 was unbound before launch and after
server/process teardown. File contexts, browser downloads, saved files,
directories, server and scratch passed their owned cleanup checks. The two
earlier cleanup results remain preserved on their own sources.

The three jobs used **75 + 66 + 73 = 214 seconds**. The final 17-minute ceiling
plus the previous 141 seconds stayed within the original 20-minute allowance.
Temporary workflow `408748668` was verified `disabled_manually` and its active
file removed. The permanent `ci.yml` remained byte-identical (Git blob
`d758b9ae4a9cdf72a96fdf02285ba6d45cafdbaf`); main preparation/retirement used
the documented skip marker. Skipped broad CI is not reported as passing CI.
Four later status-document changes leave **461/465 checked inputs unchanged**;
all 238 runtime inputs, fixtures/assertions, test helpers and checker remain
unchanged in this receipt edition. Final source/READY metadata is a separate
portfolio handoff observation, not new hosted HTTP/browser acceptance.

No database, account, production data, provider/model call, private source or
paid service was used. Real generation, authenticated/hosted persistence,
learner analytics, other browsers, physical touch/printing, visual fidelity
and full product/portfolio acceptance remain open.
