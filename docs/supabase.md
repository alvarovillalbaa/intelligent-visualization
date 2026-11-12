# Supabase

The candidate implements private Supabase Postgres and Storage selection over
the provider contracts. Native Supabase Auth and Realtime remain optional,
unfinished integrations. Hosted activation is separate from disposable proof.

The new [terminal-removal receipt](results/2026/11-12/workspace-removals.md) adds
v2 lineage/functions/triggers, including an actual restricted-role removal on
disposable PostgreSQL. This is not a new full Supabase-stack qualification.
Read the [stopped-process upgrade boundary](proposals/workspace-removal.md)
before using v2; an old `supabase db reset` invocation now refuses without the
explicit maintenance acknowledgement. The generated migration, CLI history
reconciliation, advisors and actual hosted activation have distinct limits.

Current status:

- `packages/provider-supabase` boundary exists.
- The [fresh 90-case provider packet](results/2026/11-07/supabase-provider-attempt-8.json)
  passed, including local regressions, Supabase SQL and actual private Storage/Auth.
- Real database/private Storage selection is implemented with healthy-only
  caching and failed persistence initialization cleanup. The disposable
  application TLS and browser checks have passed. Hosted acceptance remains pending.
- [Application attempt 5](results/2026/11-07/supabase-application-attempt-5.md)
  failed all four journeys: exact Slides action responses received HTTP 200 RSC
  headers, then Chromium reported an abort before successful response completion.
  Its qualified first Next-only TLS window and outer cleanup passed; the second
  window was unrun. The abort cause remains unproven, and no full identity is accepted.
- [Application attempt 6](results/2026/11-07/supabase-application-attempt-6.md)
  also failed all four journeys. Exact correlated action readers reached native
  `done` before the recorded abort callbacks, without observed read rejection or
  reader cancellation. This establishes neither network EOF nor UI acknowledgement;
  the original failure rules remain unchanged and no journey is accepted.
- [Application attempt 7](results/2026/11-07/supabase-application-attempt-7.md)
  retained all four abort failures. Its bounded post-failure checks independently
  matched fresh version UI, SQL state and private Storage bytes in every case.
  This confirms those observed publications, without accepting a full journey
  or proving network completion. The later feedback change was outside its source.
- [Application control 8](results/2026/11-07/supabase-application-attempt-8.md)
  also failed all four journeys. The handler-bypass control retained actual CDP
  cancellations; three diagnostics confirmed the awaited success-feedback branch
  and matching UI/SQL/Storage state. Desktop Course completed its first publication,
  then timed out without an exact second request binding. No journey is accepted.
- [Production control 9](results/2026/11-07/supabase-application-attempt-9.md)
  completed the actual production build, then failed the controller's missing
  `tsconfigPath` manifest lookup. Server startup, both Next TLS windows and all
  four browser journeys were unrun. Cleanup passed; no journey is accepted.
- [Production control 10](results/2026/11-07/supabase-application-attempt-10.md)
  passed focused TypeScript, production build/standalone startup and four initial
  Secure-cookie checks. All first Slides publications still aborted despite
  direct action acknowledgements and matching UI/SQL/Storage diagnostics. All four
  journeys remain failed; source/capture and owned cleanup checks passed. The
  [source investigation](research/2026/11-07/slides-production-cancellation.md)
  records the remaining distinction between action resolution and network EOF.
- The [Chromium 158 profile](results/2026/11-10/supabase-current-chromium.md)
  reached the end of all four journeys with the same application inputs. Each
  failed the strict network assertion on one aborted protected Slides artifact GET during
  the password gate. The second Next-only TLS window was unrun. Hosted
  verification remains pending.
- The [password gate repair](results/2026/11-10/supabase-password-gate.md)
  passed seven access unit checks, four desktop and narrow Chromium journeys,
  and both Next-only TLS windows. The application audit and cleanup passed.

Portable auth remains the default for Supabase persistence.

The dedicated `iv_runtime` role must have no outgoing memberships, ownership or
elevated role attributes. An incoming grant is allowed only to the exact private
schema owner with ADMIN true, INHERIT false and SET false. The owner already
controls schema DDL; this is not a general administrator or membership exemption.
Other incoming grants, including admin-only grants to an unrelated role, remain
rejected. Browser schema/RLS and application authorization requirements remain.

The [actual catalog diagnostic](results/2026/11-07/supabase-provider-diagnostic-3.md)
observed the owner grant while the original validator refused it. The narrow
correction and a real untrusted admin-only grant check passed in the later
90-case run; no migration or lineage changed. That diagnostic remains observation
only. Neither the disposable packet nor diagnostics establish hosted support or
zero global database access. Earlier failed receipts remain failed.
