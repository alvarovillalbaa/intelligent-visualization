# Intelligent Visualization

Intelligent Visualization is a Next.js + TypeScript application for creating interactive visual documents.

The platform supports exactly three primary visualization types:

- Courses
- Slide decks
- Reports

Every visualization is designed to publish as a standalone, responsive HTML artifact. The existing slide-deck product is being migrated in place; legacy slide routes and Convex data remain part of the compatibility path.

## Current Status

Implemented in the current migration slice:

- Canonical visualization document model for courses, slides, and reports.
- Durable zero-hosted local provider using SQLite under `.data/`.
- Local filesystem storage under `.data/storage`.
- Provider-neutral persistence and storage contracts.
- Standalone HTML artifact compiler with manifests and hashes.
- Local setup, doctor, reset, export, verify, and import scripts.
- First Vitest suites for domain, artifact, storage, and local provider behavior.

Still in progress:

- Full replacement of deck-facing UI/routes with visualization terminology.
- Convex provider-contract adapter and in-place Convex deck migration.
- Supabase provider.
- Cloudflare Worker + D1 provider.
- Report grid editor.
- Course editor.
- AI SDK structured-output migration.
- Eve, Workflows, Sandbox QA, and Queues.

See [docs/limitations.md](docs/limitations.md).

## Local Setup

Local mode does not require hosted services.

```bash
npm install
npm run setup:local
npm run doctor
npm run dev
```

Open `http://localhost:3000`.

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
- `convex`
- `supabase`
- `cloudflare`

Only the local provider is executable in this migration slice. Other provider boundaries exist but fail closed until their adapters and contract tests are implemented.

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
- `packages/provider-local/`: SQLite provider implementation.
- `packages/storage/`: provider-neutral storage contract and local storage adapter.
- `lib/artifacts/`: deterministic standalone HTML compiler.
- `lib/persistence/` and `lib/storage/`: lazy provider factories.
- `workers/persistence/`: Cloudflare Worker gateway skeleton for future D1 support.
- `convex/`: legacy Convex backend that will be migrated behind `packages/provider-convex`.

## Documentation

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
