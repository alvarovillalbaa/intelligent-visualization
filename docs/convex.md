# Convex

Convex remains a first-class target provider.

Current status:

- The repository still includes the `convex/` directory and `convex` package.
- A `packages/provider-convex` boundary exists.
- Existing legacy Convex access still lives in `lib/repository.ts`.

Remaining work:

- Move Convex access behind the provider contract.
- Replace deck-centric Convex schema with visualization tables.
- Add Convex file-storage adapter.
- Add deck-to-slides migration dry-run and verification.
- Run the shared provider contract suite against Convex.
