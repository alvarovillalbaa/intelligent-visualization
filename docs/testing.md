# Testing

Last updated: 2026-11-06

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
The [accepted migration receipt](results/2026/11-06/postgres-checks.md) separates
35 actual configuration/PostgreSQL passes, two actual browser passes and the
later lifecycle-only closure. All four failed overall attempts remain preserved;
no single 37-case run or current broad suite/build is claimed.
Historical 474-case and Course browser results keep their original sources and
are not relabelled as current migration acceptance.

The [private Course/Report receipt](results/2026/11-06/workspace-drafts-checks.md)
accepts sixteen PostgreSQL, eight HTTP/client and four actual desktop/narrow
journeys across three sources. The final browser execution carries verified
earlier passes without rerunning them; all four current journeys and owned
cleanup pass. It fulfills only generation and observes real save bodies through
an explicit bounded native-fetch response clone. Five failed attempts remain.
There is no single 28-case invocation or current broad suite/build claim. Hosted
Auth/storage/publication, physical devices and full-product coverage remain open
for that private-draft packet.

The separate [six immutable-storage cases](results/2026/11-06/immutable-storage-checks.md)
pass on real owned temporary filesystem objects, with scoped static and process/
fixture/scratch closure. They execute no database, browser or closed suite. Their
nine source-export inputs and Linux-only limits are recorded independently of
the earlier private-draft and migration sources.

The [canonical publication receipt](results/2026/11-06/workspace-publications-checks.md)
accepts fourteen HTTP/staging/delivery cases, six client protocol cases, twenty
real PostgreSQL cases and four actual desktop/narrow Course/Report journeys.
Forty core passes come from attempt 1, three browser passes from attempt 2 and
one narrow Report pass from attempt 3; original captures and protected runtime
inputs establish carry-forward. Both failed overall verdicts remain false.
Browser journeys use real auth/API/database/artifact operations and anonymous
readers. HTTP failure-path fixtures use mocked provider/storage dependencies;
PostgreSQL cases use trusted artifact metadata. These boundaries are distinct.
No single 44-case invocation, current broad suite/build, hosted acceptance,
unpublish/delete behavior or touch/device proof is claimed.
