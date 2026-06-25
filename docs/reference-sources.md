# Reference Sources

Baseline repository state recorded before migration work:

- Commit: `d2b1d75bec890964d04c024488fbb4f9471bbbe8`
- Branch: `main`
- Dirty state: clean before implementation

## Official Documentation Inspected

- [Next.js docs](https://nextjs.org/docs): App Router and build behavior. The repository currently uses Next `16.1.6`.
- [AI SDK docs](https://ai-sdk.dev/docs/introduction) and [structured output docs](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data): AI SDK 6 structured output now uses `generateText`/`streamText` with `Output.object`; old `generateObject`/`streamObject` are deprecated.
- [AI SDK Agents](https://ai-sdk.dev/docs/agents): durable tool-loop agent patterns and current stop conditions.
- [AI Elements](https://elements.ai-sdk.dev): UI component reference.
- [Vercel AI Gateway](https://vercel.com/docs/ai-gateway): gateway model routing, API key and OIDC modes.
- [Vercel Workflows](https://vercel.com/docs/workflows): durable workflow and step conventions.
- [Vercel Eve](https://vercel.com/docs/eve): beta filesystem conventions under `agent/`.
- [Vercel Blob](https://vercel.com/docs/vercel-blob), [Sandbox](https://vercel.com/docs/sandbox), [Queues](https://vercel.com/docs/queues), [MCP](https://vercel.com/docs/mcp), and [Connect](https://vercel.com/docs/connect): optional Vercel integration boundaries.
- [Convex self-hosting](https://docs.convex.dev/self-hosting) and [Convex file storage](https://docs.convex.dev/file-storage): hosted/self-hosted operation and storage URL behavior.
- [Supabase local development](https://supabase.com/docs/guides/local-development), [database](https://supabase.com/docs/guides/database), [storage](https://supabase.com/docs/guides/storage), and [auth](https://supabase.com/docs/guides/auth): local stack, Postgres, storage buckets, and optional auth.
- [Cloudflare Workers](https://developers.cloudflare.com/workers/), [D1](https://developers.cloudflare.com/d1/), [D1 local development](https://developers.cloudflare.com/d1/best-practices/local-development/), [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/), [R2](https://developers.cloudflare.com/r2/), and [Wrangler](https://developers.cloudflare.com/workers/wrangler/): Worker gateway, local D1 persistence, migrations, and object storage.

## Reference Repositories

### `alvarovillalbaa/plugins`

- Commit inspected: `2cbef385ad879a917f06244bbdd9ca6aefcc65e6`
- License: MIT, copyright 2026 Clous AI.
- Files inspected:
  - `marketing/skills/html-visual/SKILL.md`
  - `marketing/skills/html-visual/references/rendering-strategy.md`
  - `marketing/skills/html-visual/references/visual-directions.md`
  - `marketing/skills/html-visual/references/output-checklist.md`
  - template names under `marketing/skills/html-visual/templates/`
- Patterns adopted: layout and style as separate choices, standalone HTML artifact checklist, and avoidance of generic visual defaults.
- Patterns rejected: copying templates or skill filesystem structure into product code.
- Material copied: none.
- Required attribution: this file records the inspiration source; no copied source code requires embedded attribution.

### `mattpocock/skills`

- Commit inspected: `5d78bd0903420f97c791f834201e550c765699f8`
- License: MIT, copyright 2026 Matt Pocock.
- Files inspected:
  - `skills/productivity/teach/SKILL.md`
  - adjacent format references for mission, glossary, resources, and learning records.
- Patterns adopted: mission-driven course generation, tight lesson scope, retrieval practice, immediate feedback, glossary and trusted references.
- Patterns rejected: reproducing the source workspace filesystem literally.
- Material copied: none.
- Required attribution: this file records the inspiration source; no copied source code requires embedded attribution.

## API Differences Discovered

- The repository imports `generateObject` and `streamObject` in `lib/ai/generate-deck.ts`; AI SDK 6 marks those APIs deprecated in favor of `generateText`/`streamText` with structured `output`.
- Convex file-storage URLs are bearer-style URLs; private artifacts and source files need application-level access checks when served.
- Supabase local development requires Docker-compatible local services, so it cannot be the default zero-hosted setup.
- Cloudflare D1 bindings belong inside Workers; the Vercel-hosted Next.js app should call a signed internal Worker API rather than importing D1 bindings.
