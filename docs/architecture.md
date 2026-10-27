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

## Source Composer

The composer keeps added text sources and pending input separately, then serializes them into the existing `GenerationInput.rawText` field. `lib/client/composer-source-input.ts` owns lossless serialization and restoration; `lib/client/guest-draft.ts` retains the existing v2 guest-draft key and expiry with optional entry metadata. Legacy multiline text restores as one source. Metadata is omitted before reducing file content under storage quota pressure. See [source intake](source-intake.md) for the user flow and [focused evidence](results/2026/10-27/source-inputs.md) for verification limits.
