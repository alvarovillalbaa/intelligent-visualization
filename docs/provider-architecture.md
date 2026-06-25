# Provider Architecture

Provider selection is deployment-level through `PERSISTENCE_PROVIDER`.

Allowed values:

- `local`
- `convex`
- `supabase`
- `cloudflare`

The product domain uses `packages/backend-contracts/provider.ts`. UI, application services, AI tools, and workflows must not import Convex, Supabase, D1, R2, PostgreSQL, or SQLite SDKs directly.

Storage selection is independent through `STORAGE_PROVIDER`. `auto` resolves to local filesystem for local persistence, Convex storage for Convex, Supabase Storage for Supabase, and R2 for Cloudflare.

## Current Status

- Local provider: executable SQLite implementation exists.
- Convex provider: package boundary exists; legacy app still uses `lib/repository.ts` and Convex directly.
- Supabase provider: package boundary exists; adapter not implemented.
- Cloudflare provider: package and Worker skeleton exist; signed RPC and D1 schema parity not implemented.

Unsupported providers fail closed rather than silently falling back.
