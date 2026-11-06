# Canonical Course/Report publication acceptance

Accepted on 6 November 2026 for the local PostgreSQL/filesystem candidate. The
[user flow](../../../workspace-publication.md) describes explicit public snapshots
and recovery. Hosted configuration and unpublish/delete controls remain open.

## Sources and retained evidence

| Scope | Executed source | Execution |
| --- | --- | --- |
| 14 HTTP/staging/delivery, 6 client and 20 real PostgreSQL cases | `3f1eee91e7e7372d011267d1f0d2f5c5d6ce209f` | [attempt 1](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/42208984755), job `127862644067` |
| Desktop Course, desktop Report and narrow Course | `6d43b8d4b9393061ba0080aa4d93f87a814259ce` | [attempt 2](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/42210404640), job `127867346829` |
| Narrow Report only | `5c7ea9c2756efefa8b74dd4f872a93c7482903e1` | [attempt 3](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/42213074301), job `127876242484` |

The [canonical JSON](workspace-publications-checks.json) is 245,103 bytes, SHA256
`2ece5c82965c2a4d9af261898c7a9e3ea52707f9e37a025b3910747130b5ae6c`.
Its 27 current original captures total 29,262 decoded bytes. It validates all 63
earlier originals (36 plus 27), including raw test JSON and exact names/statuses.
Current raw Playwright JSON equals the parsed report: one expected pass, zero
unexpected/skipped/flaky cases. No single 44-case invocation is claimed.

Carry-forward verifies 267 protected runtime inputs against attempt 1, excluding
the changed publisher and diagnostic fixture, and 268 against attempt 2,
excluding only that fixture. All application inputs remain exact from attempt 2.
The current runtime export contains 269 inputs and 2,152,952 bytes, each matched
to native mode/blob/size/content. Five full source guards match 540 leaves and
9,484,929 bytes, vector SHA256
`b7a0cf5bec1652117cc3344c79905e62cffade741431947e6b768e8f11f2d1f2`.
Frozen lock: 618,662 bytes, SHA256
`b18dd278e6eded698e269d2e8400b0359083a8ba34de4721227a70b5e27c0d59`.

Both [failed attempt 1](workspace-publications-attempt-1.md) and
[failed attempt 2](workspace-publications-attempt-2.md) retain their original false
overall verdicts and immutable JSON. Attempt 1's narrow Course pass is historical
after the publisher lifecycle change. Its sign-in failure and the earlier Report
status-read abort causes remain unproven. The final pass does not explain them.

## Accepted behavior and boundaries

The forty core identities verify fresh authorization, explicit legacy ownership,
request/version reservation, saved-revision/live-pointer conflicts, replay,
transaction rollback, version resolution and bounded metadata. HTTP fixtures use
actual compilers with mocked provider/storage boundaries to exercise exclusive
envelopes, readback, lost acknowledgements, same-intent recovery without renderer
regeneration, corrupt/oversized objects, CSP/cache/redirect behavior and the legacy
reserved-namespace guard. PostgreSQL cases use real owned databases with trusted
artifact metadata; they do not run the compiler or filesystem.

The four accepted browser journeys combine the actual authenticated API, database,
compiler, filesystem and anonymous reader. Each performs two explicitly confirmed
publishes and one actual revision save: eight publication POSTs and four saves in
total. Live redirects follow the committed version; local unsaved Apply blocks
publishing; saving alone leaves public bytes unchanged. Three reads of the first
version remain byte-identical after publishing revision two. Anonymous contexts
read actual HTML. Course quiz feedback works, and version-scoped lesson completion
survives reload; quiz feedback resets on reload. Report markup stays literal.
No generation or persistence/artifact
response is fulfilled.

All accepted cases have zero unexpected request, HTTP/page/console error,
unexplained failure, dialog or analytics counts. Header-qualified streamed
navigation cancellations remain separate observations: desktop Course 1, desktop
Report 1, narrow Course 3, narrow Report 2. No failure rule was relaxed.
The current diagnostic records two status-clone EOFs and two finished Playwright
requests, revisions one then two, no abort observation or body error, false native
signal-aborted values and no remaining observer jobs. Method/path/ordinal/time
correlation is not exact JavaScript-to-Playwright request identity.

Intentional negative public reads return 404. The browser's reserved-namespace
probe uses a guessed key; it is not proof of withholding a known staged object.
The unit guard and PostgreSQL public resolver establish their separate boundaries.

## Execution and limits

The public Ubuntu 24.04 job uses Node 24.21.0, PostgreSQL 17.6, Chromium and the
unchanged frozen lock, with a 20-minute cap. All twelve current commands exit zero;
original streams reach EOF and process groups are reaped. Actual readiness,
unchanged exports, marked database removal, server shutdown, port release,
process identity and scratch identity/removal all pass with no residual or
uncertain resources. Independent read-only receipt review found no material issue.
Preparation and retirement skip normal CI; permanent `ci.yml` remains present.

Fresh host Storage Guard was 17.8 GiB free against 34.0 required, so no local
install/build/database/server/browser ran. These are development-server Chromium
desktop and 390-pixel mouse/keyboard profiles, not physical devices or touch.
There is no current broad suite/production build, hosted Supabase/Auth/RLS/storage,
production cutover, original-asset, unpublish/delete, password/embed/review,
analytics or full AI/Eve acceptance. Earlier migration/private-draft/storage
receipts keep their original source boundaries; this packet does not relabel
their entire runtime graphs as unchanged. The recorded hosting environment 403
was not retried or bypassed. No account, model call, paid service or production
data was used.
