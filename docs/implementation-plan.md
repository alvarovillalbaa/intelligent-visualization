# Implementation Plan

This repository is being migrated from a Convex-coupled slide-deck app into `Intelligent Visualization`.

## Current Completed Slice

- Canonical visualization domain model for `course`, `slides`, and `report`.
- Zod validation and legacy `DeckSource` to slides migration helper.
- Deterministic canonical serialization and SHA-256 content hashing.
- Provider-neutral persistence contract with explicit atomic domain commands.
- Durable local SQLite provider with schema migrations, seed path, idempotency, revisions, publish, rollback, analytics, leads, reviews, experiments, and workflow run records.
- Provider-neutral storage contract plus local filesystem storage adapter.
- Deterministic standalone artifact compiler for all three visualization kinds.
- `/api/system/capabilities` endpoint for provider health and capabilities.
- Local setup, doctor, reset, export, verify, import, compare, and cutover-check scripts.
- Vitest configuration and first unit/provider/storage/artifact tests.

## Remaining Implementation Order

1. Add regression coverage around current slide routes before deeper UI refactors.
2. Replace `lib/repository.ts` callers with application services backed by `getPersistenceProvider`.
3. Port Convex into `packages/provider-convex` and migrate `convex/schema.ts`.
4. Add Supabase Postgres, Storage, and optional Auth adapters.
5. Complete Cloudflare Worker + D1 RPC, signed requests, D1 migrations, and R2 storage.
6. Replace deck-facing product UI and APIs with visualization terminology.
7. Add report editor grid and course editor.
8. Migrate AI SDK structured generation to `generateText`/`streamText` with `Output.object`.
9. Add Workflows, local workflow adapter, Eve agent, Sandbox QA, and optional Queues.
10. Complete CI, Playwright, portability checks, and provider SDK leakage checks.

## Acceptance Guardrail

No provider should be documented as supported until its adapter and shared provider contract suite pass.
