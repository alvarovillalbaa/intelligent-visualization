# Storage

The storage contract lives in `packages/storage/provider.ts`.

Current implementation:

- `LocalStorageAdapter` stores files under `.data/storage`.
- Keys are normalized and path traversal is rejected.
- Object writes return SHA-256 hashes.
- Immutable writes fail if the target key already exists.

Planned adapters:

- Vercel Blob
- Convex File Storage
- Supabase Storage
- Cloudflare R2
