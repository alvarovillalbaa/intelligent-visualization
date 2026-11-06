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
- Supabase integration and live hosted persistence/storage acceptance.

The PostgreSQL migration adds focused configuration, real provider, legacy-slide
and portable-database checks. They require the explicitly configured disposable
PostgreSQL test service; each fixture creates and marks its own database, closes
its pools and refuses a drop if its marker changes or connections remain. No
existing database is reset. The prepared scope is
[the PostgreSQL acceptance proposal](proposals/postgres-provider-checks.md).
Historical 474-case and Course browser results keep their original sources and
are not relabelled as current migration acceptance.
