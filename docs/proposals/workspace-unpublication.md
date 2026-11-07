# Revoke Course/Report public access

Prepared 6 November 2026 after the accepted publication candidate
`ae8de49746320295b2ff965f865d63862d9d69ff`. The current local candidate now
implements this scope; its [43 focused checks](workspace-unpublication-checks.md)
record [39 core and four strict browser passes](../results/2026/11-07/workspace-unpublications-checks.md)
across two sources. The failed first verdict remains preserved. Standing approval covers necessary
source/access-policy changes and bounded checks; no new approval is requested.
Hosted configuration, paid services and production data are outside this slice.

## Behavior

Add explicit **Unpublish** confirmation to saved Course/Report publication status.
Revoke subsequent anonymous requests to the live URL and every existing version
URL. Preserve the saved draft, local unsaved edits, immutable version content,
artifact objects and original receipts. A later explicit publish creates a new
version UUID; revoked version URLs stay unavailable. The live URL can serve that
new publication. This is revocation, not deletion or erasure.

Requests already admitted before revocation may finish. Open pages, browser
history snapshots and copied/downloaded HTML cannot be recalled. State this limit
before confirmation. Existing public responses require revalidation; after commit,
new live/version GET and HEAD requests, including If-None-Match, must return
private/no-store 404 for revoked targets, never 304 or cached HTML.

## Durable state and concurrency

Extend `VisualizationVersion.status` with `revoked`, a public-eligibility state.
Do not change version documents, manifests, hashes, timestamps or objects. The
existing SQL status column is unconstrained TEXT; portable v1 already exports and
imports that column. Verify the actual round trip before claiming backup safety.
Do not keep revocation only in idempotency rows, which portable exports omit.

Under the existing fresh legacy session/member/workspace authorization and locked
visualization transaction, compare the expected current public version. Revoke
the visualization's published versions, set its record status to draft and retain
`published_version_id` as the last published, now revoked, version. Commit a
payload-bound unpublish receipt atomically. Never delete objects or SQL versions.
Viewers and unrelated actors cannot revoke; each retry checks current access.

Retaining the last pointer is a concurrency invariant. Clearing it creates this
race: prepare A at null, publish B, unpublish B to null, then commit A against its
original pointer. A stale prepared publish would regain permission to expose
content. Capture the original record status as well as its pointer in new prepare
envelopes and compare both during recovery/commit. Retaining B's UUID fences the
null race; comparing published versus draft fences revocation of the same UUID.
Pre-upgrade PREPARED receipts missing that status become durable conflicts with
objects and edits retained; pre-upgrade FINAL receipts still replay normally.

The write loader may accept a retained revoked pointer only for a draft record
with verified canonical ownership and original version metadata. Public state and
resolution still require a published record and published owned version. Do not
weaken password/projection checks. Reject revoked targets in the generic
`rollbackPublishedVersion` command: its current implementation accepts any owned
version and can restore an old pointer without changing draft revision. For this
canonical workspace Course/Report namespace, also refuse generic rollback to an
earlier published UUID: V1 to V2 to V1 recreates the original pointer/status pair.
Preserve legacy Slides rollback. No supported command may reactivate a revoked
version or clear/reuse the retained pointer. If canonical rollback is required
later, add a durable monotonic publication generation rather than weakening this
invariant. Future delete/restore features must preserve it too.

Use a distinct request-bound unpublish command/receipt containing actor, workspace,
visualization and expected current version. A replay returns its original receipt
alongside current state; after a later publication it reports conflict rather
than unpublishing new content. Unpublishing must not require saving working edits
or tie eligibility to a newer private draft revision/hash. Stale expected public
versions conflict without changing access. Lost acknowledgements retain the same
request intent, and uncertain requests must not silently become a new operation.

## HTTP and UI scope

Add a strict, bounded, cookie-derived, configured-origin POST endpoint for the
named operation. No caller-provided actor/storage/publication identity overrides.
Reuse private/no-store errors and bounded client response/timeout validation.
Keep publish and unpublish results distinct rather than overloading the existing
publish request shape. Add ordinary publication-status refresh with cancellation
ownership that releases completed reads before exposing UI state.

Unpublish has separate gating from Publish's saved-draft restriction: local dirty
edits alone do not require a save. Prevent concurrent save/publish/unpublish
mutations and preserve existing edits. Unknown acknowledgement keeps a stable
retry intent and the reload/beforeunload recovery warning. Confirm the expected
public version and reconcile conflicts explicitly. Historical acknowledgement
links must not claim current availability after revocation. Viewer, loading,
empty, error, retry, desktop and narrow states all need explicit behavior.

## Focused verification before activation

- Real PostgreSQL: fresh roles/projections, both formats, all-version revocation,
  retained draft/version/object metadata, later republish without resurrection,
  same-intent replay after lost acknowledgement and after newer publication,
  request/actor/target collisions, concurrent expected-pointer conflicts, atomic
  rollback, both prepared-publish races, pre-upgrade receipt handling, revoked and
  earlier-canonical rollback refusal, and preserved legacy Slides rollback.
  Portable export/import retains revoked eligibility while
  omitting sessions/operation receipts as documented.
- HTTP/client: strict origin/body/identity bounds, definite versus uncertain
  outcomes, replay/current-state validation and new anonymous GET/HEAD/conditional
  requests returning private/no-store 404 after revocation. Objects are retained.
- Actual browser: Course/Report on desktop and narrow mouse/keyboard, unsaved edits
  retained without saving, explicit unpublish confirmation, anonymous live/all old
  version refusal, reload/reopen, new publication and permanently unavailable old
  version URLs. Preserve strict network/error boundaries and real API operations.

The packet freezes thirteen HTTP, six client, twenty real PostgreSQL and four
browser identities before activation.
Reuse the owned disposable PostgreSQL/Chromium controller patterns with a bounded
temporary public job, frozen lock, original streams and full source/process/port/
database/scratch closure. Never rerun the closed publication packet unchanged or
relabel its existing evidence. Host Storage Guard remains below reserve; no local
install/build/database/server/browser. No implementation or runtime check was
performed during the original read-only design review; current implementation
and pending verification are tracked in the separate focused packet.
