# Private Course and Report saving accepted locally

Last updated: 2026-11-06

Authenticated users can explicitly save, list, reopen and revise private Course
and Report documents on the local PostgreSQL provider. Apply remains local;
Save persists. The saved page retains local edits and stable recovery intents,
and refuses an overwrite when current and acknowledged revisions diverge.
The [user flow](../../../private-workspace-drafts.md) describes these controls.

## Accepted scopes

| Scope | Actual source and execution | Result |
| --- | --- | --- |
| Sixteen real PostgreSQL identities | `feb450d17a8aa3c7022c4785e6b96b80067e3e0d`, [run 42194821248](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/42194821248), job `127815319828` | Fresh role/session checks; explicit identity projections; durable reads; revision/retry/conflict/concurrency; cross-workspace privacy; pagination; full transaction rollback. |
| Eight HTTP/client identities | `c60dea6dec75ffa0a97956afd47ed93723878818`, [run 42197974301](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/42197974301), job `127825914552` | Cookie-derived actor; private scoped reads; configured-origin/body gates; normalized receipt validation; stale/conflicting/lost/malformed/oversized/timed-out acknowledgements. |
| Four actual Chromium journeys | `3a9729fb1df58dd66023936ae195ea793b325bcc`, [run 42201021726](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/42201021726), job `127836045558`, activation `2d267e357df056d9d4b136e49dbe9b4fd2a48cd2` | Course and Report each pass on desktop and 390px narrow profiles, without retries or skips. |

Each browser journey signs in, generates an authored document, edits/Applies,
saves through the actual authenticated API, opens the private page, edits/saves
revision two, reloads, finds the workspace row, signs out and signs in again,
then reopens the persisted revision. Eight real POSTs return revision one/two
with stable draft IDs, distinct request IDs and changed document hashes. Cookie,
editor-field, saved-status and horizontal-layout assertions pass.

Only generation is fulfilled. An explicit bounded observation adapter forwards
native fetch arguments, Promise and Response unchanged, reading a real response
clone matched to each actual POST UUID. Its two reads per journey finish without
errors/pending jobs. This is instrumented browser evidence, not provider generation
or model-quality proof. The narrow profile uses mouse/keyboard; physical touch
and devices are not covered.

The four boundaries have zero unexpected requests/WebSockets, HTTP/page/console
errors, unexplained request failures or dialogs. Their 6/7/7/6 header-qualified
navigation-stream cancellations are retained separately after completed UI
transitions. They are not represented as complete response-body network success.

## Receipt and closure

The original [machine receipt](workspace-drafts-checks.json) is 230,168 bytes,
SHA-256 `ee74cb9ab7b9a8b8f2f11ebab2093b20941084ceae8f450d3e3d60d05c9ef4e6`.
All 27 current original captures verify: 24 command streams, two server streams
and the browser JSON report. All twelve commands exit zero with EOF, observed
exit/reaping and absent original process groups. Frozen install, scoped lint/types,
setup/doctor and actual route readiness pass. Lint retains one existing Composer
effect-cleanup ref warning; it has no errors.

Five native/index/mode/content guards preserve all 503 source leaves/8,306,276
bytes. The 257 exported runtime inputs total 2,043,333 bytes. The receipt verifies
all 33 attempt-2 and 30 attempt-4 original captures and protects 252/255 unchanged
runtime inputs respectively, with the exact exceptions recorded. No accepted
unit/PostgreSQL case reruns. The frozen 618,662-byte lock remains unchanged.
There is no single 28-case invocation.

Owned processes/groups, port, marked database and scratch close completely;
export hashes remain unchanged. No residual or uncertain process, forced drain
or escalation cleanup signal remains. All six temporary workspace workflows are
disabled and their QA refs retired after use; permanent `ci.yml` is retained.
Preparation/retirement skips normal CI and does not count as a normal-CI pass.

Five failed attempts remain immutable: static preparation, missing preview Back,
origin rejection, link/body observation failures, and process-monitor indexing.
Attempt 5 has no browser-command receipt or browser JSON; final cleanup does not
fill that missing evidence. Earlier failed overall verdicts remain false.

## Limits

This accepts the local private save/reopen scope. Hosted Supabase/Auth/RLS/storage,
public Course/Report publication, original file storage, full AI/Eve, every editor
action, cross-device behavior and full-product acceptance remain unfinished.
Guest drafts do not automatically transfer on signup. Main/production remain on
their earlier source until reviewed hosted configuration exists. No paid plan,
account, model call, production data or local install/build/server/browser/database
was used. The earlier PostgreSQL migration and historical 474-case/build/Course
file results retain their own sources and are not rerun or relabelled here.
