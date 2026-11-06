# Exclusive local artifact storage checks

Last updated: 2026-11-06

Private Course/Report saving is accepted separately at `9088cb7a`. The next
publication prerequisite is narrower: `LocalStorageAdapter.put` currently checks
existence and then performs an overwrite-capable write. Concurrent callers can
both observe absence. A caller-owned Buffer can also change while the adapter
awaits directory creation, so bytes and acknowledgement must use a detached
snapshot. This work does not expose drafts publicly or add a publication route.

Use an exclusive filesystem create for immutable writes, preserving ordinary
mutable replacement. The [pinned Node 24.21 filesystem documentation](https://nodejs.org/download/release/v24.21.0/docs/api/fs.html#file-system-flags)
defines `wx` as refusing an existing path and warns against a separate access
check before writing. Snapshot Buffer/Uint8Array input before the first await.
Do not delete or replace an existing object after a refusal or uncertain write.

Alvaro's standing "I approve everything / Keep going / Do all the work" covers
this necessary source repair and its bounded focused CI. Six authored T2 cases
use real owned temporary filesystem objects for concurrent immutable writes,
existing-object preservation, detached byte inputs and mutable-write compatibility.
No closed unit/provider/browser packet reruns or broad build is proposed.

The temporary public Ubuntu job is capped at 20 minutes, uses Node 24.21.0 and
the unchanged frozen lock, exports exact source inputs into owned runner storage,
and records original bounded command streams and Vitest JSON with exact identities.
Native/index/mode/content guards, observed process/group/EOF closure and owned
scratch removal must pass. Unknown processes/files are not adopted or removed.
Preparation/retirement uses `[skip actions]`; temporary CI is disabled/retired
after use and permanent CI remains. A skipped normal workflow is not a pass.

Recorded host Storage Guard remains below its reserve (20.6 GiB free, 34.0 GiB
required). No local install, build, database, server or browser runs. The job has
no database service, account, hosted provider, model call, production data or
paid enrollment. Linux fixture acceptance does not establish Windows/macOS,
network-filesystem exclusivity, power-loss durability, full symlink containment,
atomic visibility of partially written files or a database/object transaction.
Uncommitted staged objects must stay inaccessible when publication is implemented.

Compiler artifact hashes and storage raw-byte hashes retain their distinct
existing contracts. See [the next publication boundary](workspace-publication.md).
