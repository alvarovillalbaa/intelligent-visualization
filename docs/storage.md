# Storage

The storage contract lives in `packages/storage/provider.ts`.

Current implementation:

- `LocalStorageAdapter` stores files under `.data/storage`.
- Keys are normalized and path traversal is rejected.
- Object writes return SHA-256 hashes.
- Immutable writes fail if the target key already exists.

Planned adapters:

- Vercel Blob
- Supabase Storage

Database migration does not move files. Canonical objects remain under
`LOCAL_STORAGE_DIR`; legacy slide files remain under `.slides-storage`.
Portable database exports do not copy these objects. Preserve both directories
when backing up or moving an installation. Hosted storage support and its access
checks remain unfinished; no automatic fallback or live-provider acceptance is
inferred from local PostgreSQL checks.
