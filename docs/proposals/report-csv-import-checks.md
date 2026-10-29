# Report CSV import checks, pending approval

30 October 2026. **Authored and inactive; none of these checks has run.**
The supplied AGENTS.md section 7 requires approval for this new domain/browser
scope; section 14 requires approval for temporary CI and runner-only tooling.
Earlier editor/export approvals do not authorize this increment.

The [source inventory](../results/2026/10-30/report-csv-import-source.json) seals
the complete reviewed source set and exact case names. The [browser source](report-csv-import-browser.test.ts.example),
[configuration](report-csv-import-browser.config.ts.example) and
[workflow](report-csv-import-browser.yml.example) remain outside discovery and
active CI until approval.

## Exactly 176 checks

One public Ubuntu 24.04 job, capped at twenty minutes, with read-only repository
permission. Node 24.21.0; unchanged locked app dependencies via
`npm ci --ignore-scripts`. Playwright 1.58.2 and Chromium are runner-only and
live in a newly owned temporary directory. No repository dependency change,
lock regeneration, package lifecycle script, reusable cache or paid runner.

| Selection | Cases |
| --- | ---: |
| `tests/unit/report-csv-import.test.ts` | 41 |
| `tests/unit/report-authoring.test.ts` | 44 |
| `tests/unit/report-editor.test.ts` | 19 |
| `tests/unit/report-artifact.test.ts` | 64 |
| Four browser scenarios × desktop/narrow Chromium | 8 |
| **Total** | **176** |

The 168 unit registrations were derived statically, including literal loop
expansion; neither test registration modules nor callbacks were executed.
CSV cases use authored bytes through actual parser, append/Apply, history and
guest-storage source. They cover encoding/quoting/limits, immutable branded
reviews, independent parsed-data fingerprints, atomic placement, snapshot-prefix
guards, stale ownership, history and storage failure. Existing authoring/editor
cases cover the affected paths; their direct hook model is not browser proof.
The artifact suite exercises the real compiler, supplied snapshot appendix,
escaping and existing Course/Slides fingerprints independently of the browser.

Four browser scenarios run once each at 1440×1000 desktop and 390×844 Chromium
touch emulation, one worker and zero retries:

1. Review literal CSV, require explicit Add and Apply, preserve existing
   snapshots, and inspect the committed document at a stubbed HTML boundary.
2. Reject malformed/oversized files; fence held native-file-read delivery after
   header changes, replacement and cancellation; preserve the existing draft.
3. Undo/redo the table, source record and layouts together; preserve committed
   snapshot prefixes when later imports are discarded.
4. Preserve a later Course sibling, guest reload and four-hour retention;
   retain prior durable bytes when a controlled storage write fails.

The actual UI, FileReader, parser, WebCrypto and browser storage are used.
Generation and the single permitted artifact response are intercepted authored
fixtures. The artifact response **does not invoke the compiler**; the browser
checks do not save/open a native download, prove exported CSV content, call a
model/provider or establish source accuracy. File injection does not prove the
owner's native file chooser. Touch emulation is not physical-device/Safari proof.

## Activation and result gates

After approval, install only the focused workflow on canonical public main,
using the existing `[skip actions]` activation/removal convention so the broad
push workflow remains unrun. Dispatch once with the full approved forty-character
source commit. Checkout uses that immutable source rather than the activation
commit. The job verifies HEAD, complete tracked input paths, sizes and SHA-256s
against the reviewed inventory before installation and again after execution.
Missing/unexpected source or altered package/lock bytes fail the job.

The job selects exactly the four unit wrappers above, one worker, zero retries,
and the copied browser example/config. It checks every unit name against its
own suite manifest and all eight browser title/profile pairs. Every case must
pass once; skipped/TODO, flaky, unexpected, repeated, missing or extra outcomes
fail. Both runner commands must succeed. Missing or oversized JSON evidence
fails even if a runner reported success. Browser global errors fail acceptance.

Fresh browser contexts have no cookies/origins; service workers are blocked.
The example blocks unexpected external/API/mutation requests, permits only
its exact authored generation/artifact responses, and records page errors.
Existing local app/Auth modules initialize; this is not a server network
sandbox. Hosted-provider credentials are empty and AI/Eve/workflow/queue
features disabled. There is no database setup, sign-in, existing account,
production/private data, real generation, provider setting or payment.

Only TAP/runner text and bounded structured outcome summaries go to the public
job log; JSON reports are limited to 2 MiB each. No artifacts, screenshots,
traces or video are uploaded. An always-run step removes only identity-checked
copied spec/config files and the marked task temporary root, including its
tools/browser/cache/output. Playwright owns its server/context shutdown;
disposable runner teardown owns checkout dependencies. Ownership changes fail
cleanup rather than deleting unfamiliar paths. Hard termination can prevent
cleanup/logging and must remain an incomplete result.

Record the exact source/toolchain, names, counts, exits, failure evidence and
limits in owning dated results, then remove the active workflow even after
failure. Bounded repairs may rerun these same approved cases with updated source
hashes and a preserved failure receipt; expanded scope needs new approval.
No local install, test, server or browser bypasses Storage Guard. A passing job
still leaves authenticated/hosted persistence, other browsers, native downloads,
physical interaction and the complete product/portfolio acceptance unfinished.
