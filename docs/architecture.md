# Architecture

Intelligent Visualization is a Next.js App Router application with a provider-neutral backend contract.

Current migration shape:

- Root app remains the existing Next.js application.
- `packages/domain` owns canonical visualization documents.
- `packages/backend-contracts` owns persistence contracts and atomic commands.
- `packages/provider-local` implements the first executable provider.
- `packages/storage` owns storage contracts and local storage.
- `lib/artifacts` compiles typed documents into standalone HTML.

Legacy slide UI and Convex repository code still exist until the service refactor is complete.
