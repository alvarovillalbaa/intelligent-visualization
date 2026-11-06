# Exclusive local artifact storage accepted

Last updated: 2026-11-06

Immutable local writes now create their path exclusively, without a separate
existence probe. Caller-owned Buffer/Uint8Array bytes and write metadata are
captured before asynchronous work. A refusal does not replace or delete an
existing object; ordinary mutable replacement remains supported. This fixes a
publication prerequisite and does not make Course/Report drafts public.

All six new real-filesystem identities passed once at source
`cf460e65d3639d8747b48a489e741820b4820fbb`, activation
`eff37ca4bc793b143c5165c098ab41ea45a08f17`,
[run 42203942610](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/42203942610),
job `127845754714`, using public Ubuntu 24.04 and Node 24.21.0:

- Two concurrent independent adapters admit one immutable writer; stored bytes,
  size and raw hash match that winner, and the loser receives `EEXIST`.
- An existing immutable object's exact bytes survive a rejected replacement.
- Caller Buffer mutation during/after the call cannot change the saved snapshot.
- A Uint8Array view saves only its own captured bytes despite backing-array changes.
- Explicit/default mutable writes still replace content with matching hashes.
- Directory and overlong-path failures preserve existing data/directories.

These are six T3 cases against actual exclusive per-case directories, not
database, browser or multi-process fixtures. No closed suite reran. Scoped lint
and TypeScript pass; lint retains an advisory that the minimal export has no
Pages directory. That advisory was not suppressed and is not a product-UI check.
The unchanged frozen 618,662-byte lock was installed with scripts disabled.

The original [machine receipt](immutable-storage-checks.json) is 113,179 bytes,
SHA-256 `591e19a29bf920486c7d4a4957d0a5ad88eb3254c3a3c530ceeb034199f291c4`.
All eleven original captures verify: ten command streams and the raw Vitest JSON.
Five commands exit zero with EOF, observed exit/reaping and absent process groups.
Exact six names/statuses match the original JSON, without failures/skips/todos or
retries. Five full guards preserve 512 native/index source leaves/8,583,936 bytes.
The nine exported runtime inputs total 644,448 bytes and stay unchanged. Owned
case directories, processes/groups and scratch close without escalation or
uncertain ownership. Temporary CI is disabled/retired; permanent CI is retained.

The earlier private Course/Report receipt keeps its original sources. Since its
`9088cb7a` publication, only `packages/storage/local.ts` changes among its 257
runtime inputs; the other 256 stay exact. Those browser/HTTP/PostgreSQL passes
are not relabelled as executions of this new storage source.

Linux fixtures do not establish Windows/macOS, network-filesystem exclusivity,
power-loss durability, full symlink containment or atomic visibility during a
partial write. Failed/uncertain writes are not automatically deleted. Publication
must separately reconcile object hashes and database commit state and keep
uncommitted bytes inaccessible. Raw storage and canonical compiler hashes retain
different contracts. See [the publication proposal](../../../proposals/workspace-publication.md).
No local installation/build/server/browser/database, hosted provider, account,
model call, production data, paid plan or production cutover was involved.
