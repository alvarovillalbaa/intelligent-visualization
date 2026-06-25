# Testing

Current executable tests:

- Domain schema and migration tests.
- Artifact compiler tests.
- Local storage adapter tests.
- Local provider contract slice tests.

Commands:

```bash
npm run lint
npm run typecheck
npm test
npm run test:providers
npm run build
```

Remaining work:

- Regression tests for current slide UI and public routes.
- Full shared provider contract suite for all providers.
- Playwright coverage for creation, editing, publishing, review, embed, and public artifacts.
- Cloudflare, Supabase, and Convex integration jobs.
