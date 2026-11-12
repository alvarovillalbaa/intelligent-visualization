# Remove saved work from a workspace

The candidate adds **Remove from workspace** to saved Course and Report rows.
Qualification is tracked in [the new check scope](proposals/workspace-removal-checks.md);
this document is a behavior and rollout contract, not a test receipt. Slides,
guest drafts, workspaces and accounts are outside this control.

Editors and administrators open the confirmation, which loads the current saved
revision, content hash, lifecycle status and retained publication pointer. The
confirmation explains that the item becomes unavailable and new public reads
stop, while history, source documents and stored files remain retained. There is
no restore button. Removal does not save edits from another open tab.

The server compares the entire reviewed tuple under the lifecycle transaction
lock. A changed tuple produces a conflict; load the latest state and review it
before confirming again. An uncertain response keeps one stable request UUID
and payload for **Retry same removal**. Closing and competing row actions pause
until a definite outcome. The UI refreshes automatically only after a validated
accepted receipt and current terminal state. A restored tombstone without its
original receipt reports a conflict and current unavailability, without claiming
that the retried request performed the removal. Fresh session and membership
authorization applies to every retry.

Removal revokes all owned published versions, retains the last publication
pointer and changes only the parent status/timestamp. Draft bytes/hash/revision,
identity, versions, manifests, object keys and linked history remain. Ordinary
private reads, saves, cached commands, publication and Unpublish refuse the
removed item. An already-open editor keeps its working copy when saving is
refused. Newly admitted public GET/HEAD/conditional reads cannot obtain either
the live or immutable version. Previously admitted requests, open/history pages,
copied content and downloaded files cannot be recalled.

## Installation and restore boundary

Fresh local installations apply immutable v1 followed by lifecycle v2. Existing
v1 installations require an explicit stopped-process upgrade; new v2 app code
does not automatically migrate an existing database. Read the
[rollout procedure and historical compatibility audit](proposals/workspace-removal.md)
before installing. Production remains gated independently.

The new migration installs statement-level transaction advisory locks and exact
parent/child retention triggers. The common per-schema lock serializes linked
writes; it does not revoke old read access or drain old initialized connections.
Stop and prevent restart of every old app, worker, backup/export and restore tool
before upgrading. Connection snapshots alone do not prove that retirement.

Portable manifest v2 preserves tombstones, revoked versions and retained rows;
old v1 importers reject v2 manifests. New tooling accepts legitimate v1 inputs
and refuses to overwrite conflicting existing rows. A newly absent tombstone
can be staged as active only inside the restore transaction, receive its retained
children, then become terminal before commit. Existing tombstones are never
reopened. Receipts and active sessions are not restored; objects need a separate
backup. A pre-removal backup restored into an empty target cannot recover later
tombstones absent from that backup. This is not monotonic disaster recovery.
