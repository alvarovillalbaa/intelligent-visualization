# Supabase

Supabase support is planned as a provider-contract adapter over Supabase Postgres, optional Supabase Storage, optional Supabase Auth, and optional Supabase Realtime.

Current status:

- `packages/provider-supabase` boundary exists.
- The [fresh 90-case provider packet](results/2026/11-07/supabase-provider-attempt-8.json)
  passed, including local regressions, Supabase SQL and actual private Storage/Auth.
- Real database/private Storage selection is implemented with healthy-only
  caching and failed persistence initialization cleanup. Application TLS/browser
  verification and actual hosted acceptance remain pending.
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
