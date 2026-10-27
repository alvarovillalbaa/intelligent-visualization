# All-format persistence and publication proposal

Status: source-reviewed design; hosted binding/capacity and mutation approvals pending. No schema, Auth, configuration, resource-sharing, or provider change is activated.

The user confirmed multi-format generation from one set of sources and requires free hosting. Durable workspace saving and publication must cover Course and Report as well as the existing Slides path. [Provider architecture](../provider-architecture.md) and [the contract](../provider-contract.md) remain authoritative: a provider cannot be called supported until its adapter and shared contract checks pass.

## Read-only capacity evidence — 2026-10-27

The connected Supabase organization is Clous (`jnmtatndgpzawemtiukl`), confirmed on the Free plan. Project metadata showed Still (`wosqlzijmyiemueoittw`) and Dearweek (`faftywddybmgamvseibe`) active and healthy; Kickoff's retired project and the other two projects are inactive. Still already hosts the explicitly approved Still/Kickoff consolidation. That approval does not authorize adding this application.

An aggregate metadata query on Still reported database size 12,007,091 bytes, zero storage buckets, and zero stored object bytes. Existing schemas include `public`, `private`, and `still_private`; no visualization-specific schema exists. No application rows, account data, keys, credentials, or object contents were retrieved. These observations are a point-in-time size check, not throughput, usage-quota, or isolation proof.

The official [billing documentation](https://supabase.com/docs/guides/platform/billing-on-supabase), read through Supabase's documentation tool, grants two active free projects across organizations where the account is Owner or Administrator, 500 MB database size per project, and 1 GB storage. Paused projects do not count. Moving this app to another new free project is therefore unavailable without retiring another active project. No app will be paused and no paid plan, new account, or trial is proposed.

## Preferred bridge, conditional on an existing IV Convex project

The smallest safe cutover reuses the existing legacy identity realm and keeps current Slides records, editor, and public URLs. If an existing IV Convex project with free capacity is confirmed, add separate canonical Course/Report records behind an application service. No Auth account migration, email merge, bulk Slides conversion, or new Supabase resource is inherently required. Putting canonical documents into the existing `decks.source` `v.any()` field would avoid an additive table while breaking readers and editors that require `DeckSource`; it is not recommended.

The required additive tables are `visualizations` (typed document, kind, revision/hash, team/workspace/creator, public ID, publication pointer), `visualizationVersions` (immutable stored document, renderer, durable artifact binding/hash/manifest), `visualizationCommands` (actor/workspace/operation-scoped idempotency key and payload hash, target/result IDs, operation state), and `visualizationSources` (extracted source content or private bindings/provenance). Keep existing user/session/team/workspace identities. Use command receipts for existing Slides saves too, retaining their rich source and renderer.

Every save supplies a stable result ID before its first attempt. One authorized mutation creates both record and receipt. The same operation/payload returns the same saved ID; reusing a key with different content conflicts. Revision updates and publication require expected-revision checks. Publication compiles the stored revision, stages durable bytes, then atomically commits the version and published pointer. An ambiguous acknowledgement must be reconciled by operation ID before retry or cleanup. Rollback disables new writes and retains receipts, rows, and artifacts.

Source inspection found two prerequisites in the existing legacy path:

- [`convex/auth.ts`](../../convex/auth.ts) `getUserByEmail` returns Convex `_id` without application `id`; [`lib/repository.ts`](../../lib/repository.ts) casts it to `UserRecord`, and [`lib/server-auth.ts`](../../lib/server-auth.ts) expects `id`. Normalize this at the adapter boundary.
- Public generic functions such as `createDeck` and `patchDeck` in [`convex/app.ts`](../../convex/app.ts) accept supplied records/IDs without session checks. New secure functions alone would leave these mutation paths open. Introduce an approved server-only relay/internal-function boundary and resolve fresh user, role, and workspace ownership in the mutation. Preserve current cookie/token-hash sessions; do not deploy an Auth enforcement change under this UI repair.

Add `lib/services/visualization-service.ts`, `app/actions/visualizations.ts`, guarded `convex/visualizations.ts`/`convex/http.ts`, and adapters inside `packages/provider-convex/`. Update the Convex schema/Auth/app boundary, repository/factories/contracts, workspace listing, per-result save receipts/links, canonical detail/public routes, durable artifact storage, private file access, and canonical events. Existing canonical compiler public IDs/events do not yet match the legacy event endpoint. Keep `/d`, `/embed`, and the Slides editor compatible. All mutation approval gates apply before implementation or deployment.

No tool currently verifies that an IV Convex deployment exists or has capacity. A non-decrypting Vercel environment-name lookup for the IV project returned `403 forbidden`; it was not retried or bypassed. No variable values were retrieved. This permission response does not establish that the provider is absent or that signing in again will fix access. Linen's deferred Convex capacity decision is separate. If no IV project can be verified, present the isolated Still-sharing alternative for explicit approval; do not assume that choice.

## Required implementation decisions

Keep the current verified server session and workspace memberships authoritative. Do not infer identity or membership from client fields, untrusted metadata, or email equality. The legacy app currently uses its own repository/Auth path, while canonical provider factories execute only the local provider. Merely setting a provider variable would not connect the existing app.

The bridge needs typed all-kind saved records, versioned documents, stable save identities and payload validation, role checks on every private operation, reconciliation of ambiguous save acknowledgements, and a coherent public route/artifact/event path. Rich Slides source/editor/rendering must survive; the canonical Slides compiler's existing image/chart placeholders cannot silently replace it. Existing URLs and private access must remain compatible. Publication must not succeed until durable storage and metadata agree.

An additive identity projection, if needed, must map the existing identity realm and native ID explicitly; it must never merge accounts by email. Any schema change, additional provider dependency, Auth/security change, or production configuration remains a separate approval gate. A shared Still deployment would increase the service credential's blast radius even with application-specific tables; it requires a concrete isolation/grant design and explicit authorization before use.

## Acceptance gate

Prepare the exact schema, adapter/service changes, rollback boundary, and disposable regression scope before requesting approval. Verify allowed/denied roles and cross-workspace access, idempotent retry and unknown acknowledgements, all-kind read-after-reload, save/publish/delete consistency, rich Slides parity, and legacy URL access. Run shared provider contracts before advertising hosted support. Migrations and production acceptance cannot be inferred from source review or a successful Vercel build.

No resource-sharing choice is assumed. The existing guest batch repair can be reviewed separately while this backend proposal is completed.
