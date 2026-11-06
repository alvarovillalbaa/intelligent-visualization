# Architecture

Last updated: 2026-11-06

Intelligent Visualization is a Next.js App Router application with a provider-neutral backend contract.

Current migration shape:

- Root app remains the existing Next.js application.
- `packages/domain` owns canonical visualization documents.
- `packages/backend-contracts` owns persistence contracts and atomic commands.
- `packages/provider-local` implements the first executable provider.
- `packages/storage` owns storage contracts and local storage.
- `lib/artifacts` compiles typed documents into standalone HTML.

Legacy slide UI remains compatible. Its repository loads a dedicated PostgreSQL
JSONB state row under a transaction lock, runs the existing operations in an
instance closure, then commits before returning. Canonical visualization tables
share the database namespace; they retain their separate domain model. Production
requests do not initialize demo state or fall back to process memory. Setup seeds
explicitly, only when absent. The in-memory demo store is an isolated test fixture.

Private Course/Report saves use `WorkspaceDraftRepository` through server
application services. The cookie-derived actor is reauthorized against the
locked legacy session/membership state; canonical team/workspace/actor IDs use
explicit legacy namespaces without merging accounts. The same connection holds
that lock through the draft, payload-bound receipt and legacy-state commit.
Lists and private pages read current scoped records without provisioning mirrors.
The client keeps local Apply, explicit Save, accepted revision and unresolved
intent separately. See [private drafts](private-workspace-drafts.md) and
[provider architecture](provider-architecture.md).

`WorkspacePublicationRepository` adds named prepare/commit/resolve operations over
the same database. Each mutation freshly authorizes the legacy actor and binds
the request/version IDs, saved revision/hash and original live pointer. The
application service verifies one exclusively created artifact envelope before
atomically committing the version, pointer and receipt. Retries preserve original
bytes and acknowledgements; concurrent draft/pointer changes cause conflict.
Canonical `/v/` readers resolve committed ownership before validating stored HTML,
manifest, hashes and stored CSP. The legacy raw-file reader rejects the reserved
publication namespace. See [publication](workspace-publication.md) and its
[separate acceptance](results/2026/11-06/workspace-publications-checks.md).

## Source Composer

The composer keeps added text sources and pending input separately, then serializes them into the existing `GenerationInput.rawText` field. `lib/client/composer-source-input.ts` owns lossless serialization and restoration; `lib/client/guest-draft.ts` retains the existing v2 guest-draft key and expiry with optional entry metadata. Legacy multiline text restores as one source. Metadata is omitted before reducing file content under storage quota pressure. See [source intake](source-intake.md) for the user flow and [focused evidence](results/2026/10-27/source-inputs.md) for verification limits.

`lib/client/generation-batch.ts` owns immutable batch updates, stable per-kind result IDs, frozen retry input, and validated restoration. The composer orchestrates one request at a time; backend transport remains one kind per request. Results and save acknowledgements are separate states. Guest storage strips compiled HTML, protects an invalid stored batch from automatic replacement, and never silently clips the frozen batch input. See [AI generation](ai-generation.md) and its linked evidence for exact scope. Canonical provider factories remain local-only; the batch UI does not establish hosted-provider support.
