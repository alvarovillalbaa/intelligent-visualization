# Private Course and Report draft checks

Last updated: 2026-11-06

This candidate makes authenticated Course/Report saving and private reopening
functional on the implemented local PostgreSQL provider. Alvaro's standing
"I approve everything / Keep going / Do all the work" authorizes the necessary
source, access checks and focused temporary CI. No paid plan, account, hosted
configuration, production data or model call is involved.

The API obtains a token from the server cookie. The provider rechecks expiry,
membership, matching user/member roles and workspace ownership while holding
the legacy state lock through the canonical write. Explicit legacy-team,
legacy-workspace and legacy-user namespaces do not merge accounts by email or
copy passwords/sessions. Reads verify projection ownership without provisioning.
Viewers may read; admin/editor roles may save. Drafts have no public link.

One stable UUID identifies a draft; a separate UUID identifies each save intent.
Revision zero creates it. Later saves compare the expected revision. Receipts
bind the actor, workspace, target, request UUID and normalized payload hash.
Replays authorize afresh and return the original receipt alongside current state.
The UI retains edits/uncertain intents and refuses to overwrite a newer revision.
Apply remains local; Save Course/Report or Save revision persists explicitly.

The prepared temporary public Ubuntu job is capped at 20 minutes, pins Node
24.21.0 and uses the unchanged frozen lock. A fresh PostgreSQL 17.6 service and
marked per-test databases hold authored disposable T3 data. Host Storage Guard
reported 20.6 GiB free against 34.0 required; no local installation, server,
browser, build or database may run. Runtime work stays in owned runner storage.

The exact scope is eight T2 HTTP/client cases, sixteen real PostgreSQL cases and
four desktop/narrow Chromium identities: Course and Report generate from an
intercepted authored document, Apply, save through the actual authenticated API,
open privately, edit/save revision two, reload and reopen after a new session.
Only generation is fulfilled. Persistence, sessions, pages and saves are real.
The new source is linted and typechecked in isolation. No old 474-case suite,
35-case PostgreSQL packet or two prior browser journeys are repeated.

The runner records original bounded streams/reports, exact names/statuses,
native/index/mode/export hashes, actual readiness, owned process/port/database
closure and scratch removal. Unknown resources are never adopted or deleted.
Known header-qualified streamed-navigation cancellations remain separate evidence;
missing responses/assets/documents/errors still fail. Temporary workflows are
QA-only and disabled/retired after use. Failed attempts remain preserved.

This is local saving acceptance, not hosted Supabase/Auth/RLS/storage, publication,
AI/Eve, physical touch/device, every editor action or full-product proof. Guest
drafts still require explicit recovery; creating an account does not transfer them.
Original uploaded files and published artifacts are separate storage work. Main
and production remain held until their database/storage configuration is ready.
