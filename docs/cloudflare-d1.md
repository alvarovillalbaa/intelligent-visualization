# Cloudflare Workers + D1

Cloudflare persistence uses a Worker gateway over D1.

Current status:

- `workers/persistence` package exists.
- `/internal/v1/health` Worker endpoint exists.
- Initial Worker configuration and a starter migration exist.
- Signed RPC, full D1 schema, R2 adapter, and contract tests are not implemented yet.

The Next.js application must not import D1 bindings directly.
