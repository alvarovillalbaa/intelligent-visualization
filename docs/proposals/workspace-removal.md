# Remove a saved Course or Report from its workspace

Status: **qualified candidate, off production**, 12 November 2026. The
[removal receipt](../results/2026/11-12/workspace-removals.md) accepts 34 distinct
core identities across two sources and four browser identities at a third source.
The Supabase
application password gate closed on 10 November at `e35ad7c6`; that result does
not qualify this new lifecycle scope. Historical design notes below retain their
7 November context. New checks are scoped in [removal checks](workspace-removal-checks.md).

The candidate chooses immutable v1 plus an explicit v2 migration. A per-schema
transaction advisory lock precedes legacy/parent locks and every linked DML
statement; row triggers protect the removed parent and both old/new parent
references for all 12 child tables. This conservative lock serializes canonical
lifecycle writes in a schema. It trades write concurrency for a bounded, common
ordering across old SQL writers and the new application. It does not fence old
SELECTs or evict old initialized pools: retiring every old app, worker and backup
tool is mandatory before activation. The receipt does not establish that
production retirement; no live upgrade was performed here.

Existing v1 local databases refuse automatic upgrade. After process retirement,
the operator runs `npm run setup:local -- --upgrade-lifecycle-v2
--acknowledge-stopped-v1-processes`; any other local app connection refuses it.
Hosted migration SQL is printed by `tsx scripts/lifecycle-migration.ts
--print-supabase-sql` without connecting. An operator must set
`iv.lifecycle_v2_retired=true` in the applying migration-owner session after
retirement; the SQL refuses other runtime connections and takes exclusive table
locks. A peer snapshot does not establish future quiescence. Drain and prevent
old restarts, apply the new migration, start only v2 processes, then qualify
the actual deployment. Never use runtime credentials for DDL.

The CLI-created [v2 migration](../../supabase/migrations/20261112225304_terminal_visualization_removal_v2.sql)
contains the exact 12,542-byte factory output qualified under the restricted role.
Its generation/readback is recorded [separately](../results/2026/11-12/workspace-removals-migration.json).
Even an empty Supabase reset must supply the explicit maintenance acknowledgement;
old reset/CI tooling must not replay unchanged. The file was not applied through
Supabase CLI and CLI history/advisors remain unverified. Once tombstones exist,
roll forward with v2-capable readers/tools; do not restart v1 or restore an old
backup as an implicit rollback. Reconcile Supabase migration history under the
reviewed migration-owner process before any hosted activation.

New ordinary reads and cached commands refuse tombstones. Portable v2 retains
the graph and stages only newly absent tombstones as draft inside the restore
transaction before terminalization. Identical existing rows are compared before
INSERT; existing tombstones are never reopened. Receipts remain excluded. No
monotonic recovery promise is made for an empty target restored from a backup
that predates removal. Read/export requests admitted before removal and copied
content cannot be recalled. No storage deletion or bypass URL is introduced.

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

## Compatibility audit appendix — 7 November 2026

Removal remains **NEXT and unimplemented**, held behind the current Supabase
application gate. Recommend a separate versioned v2 migration with terminal DB
fences, preserving immutable v1, **plus proved retirement of old processes and
tools**. Simultaneous old-reader support is not claimed.

The fence should reject changes/deletion of an already removed parent, preserve
its identity and retained graph, and serialize child mutations against removal.
[Current child and generic command lanes](../../packages/provider-postgres/adapter.ts)
need parent-first locking; retargeting must check both old and new parents in a
consistent order. A plain parent status read leaves a race. Exact child coverage,
lock ordering, restore exceptions and trigger definitions remain design/verification
work. PostgreSQL executes triggers in the writing transaction, so trigger errors
roll back its effects: [PostgreSQL 17 trigger behavior](https://www.postgresql.org/docs/17/trigger-definition.html).

Triggers alone cannot fence reads: generic `withIdempotency` returns cached full
records before checking the target. [Hosted grants/policies](../../supabase/migrations/20261107002755_intelligent_visualization_hosted.sql)
currently permit runtime reads of every row. Both [local initialization](../../packages/provider-local/database.ts)
and [hosted validation](../../packages/provider-supabase/schema.ts) cache successful
lineage checks. New lineage therefore rejects newly initialized old binaries,
but does not evict existing pools. Drain old app instances, jobs and portable
snapshots before enabling removal. Local owner-level DDL remains a trusted
operator boundary.

[Portable v1](../../packages/provider-postgres/portable.ts) accepts arbitrary text
statuses and omits receipts/lineage. V2 needs explicit lifecycle compatibility.
For newly absent tombstones only, a transactional importer could stage the parent
as nonterminal, restore its retained children, then terminalize before commit;
never temporarily reopen an existing tombstone. Compare identical existing rows
before attempted inserts. This restore design still requires validation.

Preservation covers removals present in the selected backup or current target.
Restoring a pre-removal backup into an empty target loses later tombstones absent
from both: v2 format alone cannot prevent that resurrection. Stronger monotonic
recovery requires independently retained latest tombstone/revocation history and
explicit reconciliation. No such recovery mechanism or new authority is implemented.
