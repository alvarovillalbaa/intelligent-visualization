# Storage

Last updated: 2026-11-06

The storage contract lives in `packages/storage/provider.ts`.

Current implementation:

- `LocalStorageAdapter` stores files under `.data/storage`.
- Keys are normalized and path traversal is rejected.
- Object writes return SHA-256 hashes.
- Immutable writes use exclusive creation and fail if the target path already exists.
- `put` snapshots caller-owned Buffer/Uint8Array bytes and write metadata before asynchronous work; the acknowledged size/hash describe those bytes.

Immutable creation does not perform a separate existence probe or overwrite a
refused object. Mutable writes retain explicit/default replacement behavior.
The adapter does not delete objects after a failed or uncertain write; a newly
created partial object may need application-level reconciliation. Filesystem
creation is not a transaction with the publication database, and a visible object
is not itself evidence that a publication committed.

Storage hashes cover raw bytes. Compiler artifact hashes cover the canonical
serialization of the HTML string; preserve those separate contracts. See the
[focused storage scope](proposals/immutable-storage-checks.md) and
[publication boundary](proposals/workspace-publication.md).

The [six accepted filesystem cases](results/2026/11-06/immutable-storage-checks.md)
verify exclusive writes, detached byte inputs and mutable compatibility on the
recorded Linux source. They do not establish power-loss or hosted publication.

Planned adapters:

- Vercel Blob
- Supabase Storage

Database migration does not move files. Canonical objects remain under
`LOCAL_STORAGE_DIR`; legacy slide files remain under `.slides-storage`.
Portable database exports do not copy these objects. Preserve both directories
when backing up or moving an installation. Hosted storage support and its access
checks remain unfinished; no automatic fallback or live-provider acceptance is
inferred from local PostgreSQL checks.
