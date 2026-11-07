# Intelligent Visualization

Last updated: 2026-11-07

Intelligent Visualization is a Next.js + TypeScript application for creating interactive visual documents.

The platform supports exactly three primary visualization types:

- Courses
- Slide decks
- Reports

Every visualization is designed to publish as a standalone, responsive HTML artifact. Existing slide routes retain their record shapes and behavior through a PostgreSQL repository.

## Current Status

Implemented in the current migration slice:

- Canonical visualization document model for courses, slides, and reports.
- Explicit local PostgreSQL provider in the isolated `intelligent_visualization_local` schema.
- Durable, transactional legacy slide operations alongside canonical visualization tables.
- Local filesystem storage under `.data/storage`, with [exclusive immutable writes and detached byte snapshots](docs/results/2026/11-06/immutable-storage-checks.md).
- Provider-neutral persistence and storage contracts.
- Standalone HTML artifact compiler with manifests and hashes.
- Explicit local setup, doctor and private database export/import tools. Reset never deletes data automatically.
- First Vitest suites for domain, artifact, storage, and local provider behavior.
- [Course authoring](docs/course-authoring.md) for generated browser drafts, with typed content/practice fields, isolated preview and guarded Apply.
- [Report authoring](docs/report-authoring.md) for responsive browser-draft layouts, typed blocks, locks and local undo/redo.
- [Report CSV import](docs/report-csv-import.md) reviews local text cells before adding a table and an original-data fingerprint to the draft.
- [Report HTML export](docs/report-export.md) for a standalone copy of a committed Report draft.
- [Course HTML export](docs/course-export.md) preserves the committed learner content in a standalone Course copy.
- [Private workspace drafts](docs/private-workspace-drafts.md) let authenticated users explicitly save, reopen and revise Course/Report documents on local PostgreSQL.
- [Course/Report publication](docs/workspace-publication.md) explicitly publishes a saved revision to anonymous live and immutable-version links, keeping later draft edits separate.
- [Unpublish](docs/workspace-unpublication.md) revokes existing Course/Report public versions while preserving drafts, local edits and stored content.

The current [PostgreSQL migration checks](docs/results/2026/11-06/postgres-checks.md)
accept seven configuration, 28 real PostgreSQL and two actual desktop/narrow
browser identities at their separately recorded sources. Current scoped static,
setup/doctor and owned shutdown checks passed without rerunning accepted cases.
The candidate remains on a work branch until hosted configuration is ready.

The separate [private draft checks](docs/results/2026/11-06/workspace-drafts-checks.md)
accept sixteen real PostgreSQL cases, eight HTTP/client cases and four actual
desktop/narrow Course/Report journeys at their recorded sources. Save, reopen,
revision-two editing, reload and a new sign-in session pass. Earlier accepted
cases are carried by exact input/capture checks; no single 28-case run is claimed.
Hosted persistence/publication remains unfinished.

The [local publication receipt](docs/results/2026/11-06/workspace-publications-checks.md)
accepts forty HTTP/client/PostgreSQL cases and four actual desktop/narrow
Course/Report journeys across three recorded sources. Real publication, anonymous
reads, revision-two publication and unchanged earlier version bytes pass. Earlier
passes are carried by exact input/capture checks; both failed overall attempts
remain. Deletion and hosted publication are still unfinished.

The separate [Unpublish receipt](docs/results/2026/11-07/workspace-unpublications-checks.md)
accepts 39 core cases and four desktop/narrow journeys across two sources. Existing
live/version links are refused after revocation, private edits and stored bytes
remain, and later publishing does not reopen revoked versions. The failed first
browser execution remains preserved; its abort causes are not established.

The historical [Report CSV checks](docs/results/2026/11-04/report-csv-import-checks.md)
passed all 176 focused cases on 4 November 2026. The separate
[normal quality CI](docs/results/2026/11-04/report-csv-import-normal-ci.md)
passed 474 tests, three local-provider checks, typecheck, export verification
and the production build; lint retains 16 warnings. This verifies the authored
local-provider flow and Chromium profiles, with hosted acceptance still open.

The separate [Course download/file checks](docs/results/2026/11-05/course-export-browser-checks.md)
accept four desktop/mobile-emulated identities across three executions: actual
local compilation, browser download, reopened learner interactions and 503 retry.
Generation uses authored responses. Three first-run passes were retained; the
desktop completion passed after correcting a documented Next development-font
boundary. Both failures remain preserved; no single four-pass run is claimed.

Still in progress:

- Full replacement of deck-facing UI/routes with visualization terminology.
- Supabase provider.
- Report browser/download/print acceptance and hosted saving/publication.
- Hosted Course saving/publication and learner analytics; browser draft authoring is implemented.
- AI SDK structured-output migration.
- Eve, Workflows, Sandbox QA, and Queues.

See [docs/limitations.md](docs/limitations.md).

## Local Setup

Local mode does not require hosted services.

```bash
npm install
cp .env.example .env.local
docker compose up -d postgres
npm run setup:local
npm run doctor
npm run dev
```

Open `http://localhost:3000`. CLI commands read `.env.local` then `.env`, preserving
already configured environment values. `LOCAL_DATABASE_URL` must identify a
loopback PostgreSQL database; the app never selects a file or hosted fallback.
See [the PostgreSQL migration](docs/postgres-migration.md) before upgrading an
existing installation. Existing database and storage files are not deleted or
automatically imported.

Seeded demo credentials:

- Email: `morgan@northstarlabs.com`
- Password: `demo1234`

## Provider Selection

```bash
PERSISTENCE_PROVIDER=local
STORAGE_PROVIDER=auto
AUTH_PROVIDER=portable
REALTIME_PROVIDER=auto
```

Allowed persistence providers:

- `local`
- `supabase`

Local PostgreSQL remains the default. Supabase PostgreSQL and private Storage
adapters and application selection are implemented; the separate 90-case provider
packet passed at its [recorded source](docs/results/2026/11-07/supabase-provider-attempt-8.md).
The [latest application run](docs/results/2026/11-07/supabase-application-attempt-7.md)
failed all four journeys, so application and hosted acceptance remain pending.
Portable authentication remains the default; native Supabase Auth, Vercel Blob
and the remaining AI/Eve suite are unfinished. This candidate stays off production
until verified hosting database and private Storage configuration are available.
See [Supabase status and setup boundaries](docs/supabase.md).

## Commands

```bash
npm run dev
npm run build
npm run lint
npm run typecheck
npm test

npm run setup:local
npm run doctor
npm run db:local:reset

npm run data:export -- --provider local --output .data/exports/export-001
npm run data:verify -- --input .data/exports/export-001
npm run data:import -- --provider local --input .data/exports/export-001
```

## Architecture

- `packages/domain/`: canonical visualization entities, schemas, migrations, IDs, serialization, and starter documents.
- `packages/backend-contracts/`: provider-neutral persistence contract and atomic domain commands.
- `packages/provider-local/`: PostgreSQL provider, transaction/connection ownership and portable database format.
- `packages/storage/`: provider-neutral storage contract and local storage adapter.
- `lib/artifacts/`: deterministic standalone HTML compiler.
- `lib/persistence/` and `lib/storage/`: lazy provider factories.
- `lib/legacy-operations.ts`: existing slide behavior instantiated for a loaded transaction state.
- `lib/repository.ts`: server repository backed by a locked PostgreSQL JSONB legacy record.

## Documentation

- [Source intake](docs/source-intake.md)
- [Architecture and provider status](docs/provider-architecture.md)
- [Provider contract](docs/provider-contract.md)
- [Local development](docs/local-development.md)
- [Storage](docs/storage.md)
- [Artifact runtime](docs/artifact-runtime.md)
- [Report rendering](docs/report-rendering.md)
- [Reference sources](docs/reference-sources.md)
- [Implementation plan](docs/implementation-plan.md)

## License

MIT. See [LICENSE](LICENSE).
