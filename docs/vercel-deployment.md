# Vercel Deployment

The application remains Vercel-first.

Current deployable slice:

- Next.js production build succeeds with local provider settings and `AI_ENABLED=false`.
- AI Gateway is centralized in `lib/ai/provider-registry.ts`.

Remaining work:

- Vercel Blob adapter.
- Workflows.
- Eve.
- Sandbox QA.
- Optional Queues.
- Observability guidance.
