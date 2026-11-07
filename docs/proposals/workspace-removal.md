# Remove a saved Course or Report from its workspace

Status: **NEXT, not implemented**. Prepared 7 November 2026 from read-only source
inspection. Implementation is held until the Supabase application gate closes
and the reader/writer compatibility decisions below are resolved. Earlier failed
application attempts do not establish acceptance.

## User-visible boundary

The smallest slice is **Remove from workspace** for one saved canonical Course or
Report. Confirmation must disclose that the saved item becomes unavailable and
new public reads stop, while history, source documents and storage objects remain
retained. This is terminal logical removal, without a restore control in this
slice. It does not erase data or cover Slides, workspaces, accounts or guest work.

## Command and current-state contract

Add a versioned workspace-removal contract alongside
[draft contracts](../../packages/backend-contracts/workspace-drafts.ts), registered
on [the provider interface](../../packages/backend-contracts/provider.ts).
The proposed `WorkspaceRemovalRepository` has `get(access, id)` and
`remove(access, input)`; proposed types are:

```ts
type RemovalExpected = {
  draftRevision: number; draftHash: string
  status: "draft" | "preview" | "published" | "archived"
  publishedVersionId: string | null
}
type RemoveWorkspaceDraftInput = {
  id: string; requestId: string; expected: RemovalExpected
}
type RemovalResult = {
  status: "removed" | "conflict"
  current: Omit<RemovalExpected, "status"> & { id: string; status: RemovalExpected["status"] | "removed" }
  receipt: { requestId: string; status: "removed" | "conflict"; removedAt: string | null }
}
```

`get` returns `RemovalExpected` plus id/kind/bounded title, or null. It exposes
the retained pointer after Unpublish; `WorkspacePublicationState.current` alone
cannot supply it. Removed targets are absent from ordinary reads; authorized
internal tombstone lookup remains. Validate UUIDs/hashes/strict properties/revisions.

Bind the request UUID to actor/team/workspace/id and the entire expected tuple
with a server-normalized hash. Freshly authorize every attempt before receipt
lookup. Refuse changed-payload/cross-scope reuse without leaking another target.
Replay preserves the original receipt and returns current minimal state;
top-level `removed` requires an original accepted receipt and a currently removed
target. Stale revision/hash/status/pointer returns conflict without mutation.
Absent receipts after restore cannot be invented: report current terminal state
and conflict, rather than claiming the original request was accepted.

## Transaction, authorization and terminal fences

Reuse [fresh legacy authorization/projection checks](../../packages/provider-postgres/workspace-drafts.ts)
and the adapter's exact selected connection/transaction and legacy lock. Preserve
current write-role rules; viewers cannot remove. Recheck session expiry, user,
membership/role agreement, workspace/team binding, namespaced IDs and projection
marker. Do not provision canonical users or merge accounts by email.

Under the row lock, atomically compare the tuple, mark owned published versions
`revoked`, set the record's explicit terminal status to `removed`, update its
timestamp and write the receipt. Keep draft revision/content/hash, IDs, retained
last publication pointer, versions, manifests and object keys. No storage I/O or
object deletion belongs in this SQL transaction. No new public version is created.

[Domain status](../../packages/domain/entities.ts) needs explicit lifecycle
semantics; existing `archived` is not terminal. TEXT avoids column-type DDL only,
not a possible need for other SQL DDL. Check versioned domain/portable compatibility.
Older cached writers ignore new terminal semantics: mixed-writer rollout safety
remains unresolved. Require proved quiescence or DB fences/metadata-versioning;
any required DB fence needs separate versioned migration design. Preserve immutable v1.

Guard ordinary list/get, save/replay, publication state/prepare/commit/replay,
Unpublish, checkpoint restore and generic save/publish/rollback lanes in
[workspace drafts](../../packages/provider-postgres/workspace-drafts.ts),
[publications](../../packages/provider-postgres/workspace-publications.ts) and
[commands](../../packages/provider-postgres/adapter.ts). Guard before cached command
results as well as mutations; inventory direct child writes. A hidden row or
status-only change must not reopen, overwrite, recreate or expose removed targets. Preserve Slides.

## HTTP, UI, retention and verification

Use [the application service](../../lib/workspace-drafts.ts), existing
[visualization-ID route](../../app/api/workspaces/[workspaceSlug]/visualizations/[visualizationId]/route.ts)
and [configured-Origin/private no-store admission](../../lib/workspace-draft-http.ts).
Start with confirmation from the workspace's saved-item row. Refresh the tuple,
keep one stable request through uncertain outcomes, prevent competing mutations
and navigate only after confirmed state. Do not force-save or silently discard
local edits; already-open editors must retain their working copy on refusal.

[Portable backups](../../packages/provider-postgres/portable.ts) already export
record/version statuses but omit receipts. Introduce portable manifest version 2
for terminal removal, retaining compatible old-format import;
older incompatible importers must refuse the new format. Preserve tombstones,
IDs, pointers and revocations through restore. Objects remain separate.

Hard deletion is deferred: FK cascades erase history/reviews/experiments, while
analytics, leads, workflows and receipts lack equivalent cascades. Storage delete
cannot atomically reconcile SQL references, shared objects or uncertain writes.
Retained private keys must not acquire public/signed bypasses. Fresh public
GET/HEAD/conditional requests must refuse both live and immutable URLs; admitted
requests, open/history pages and copied/downloaded content cannot be recalled.

Focused verification must cover fresh/revoked/viewer/cross-scope authorization,
CAS/races and lost acknowledgements, changed request reuse, terminal mutation and
old prepared/final replay fences, private reads/list pagination, retained bytes,
real export/import without receipts, public cache/refusal behavior, dirty edits
and desktop/narrow confirmation/recovery. No pass counts or execution are claimed.
Use owned disposable CI fixtures only; no local storage-heavy operation is implied.
