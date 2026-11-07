# Supabase

Supabase support is planned as a provider-contract adapter over Supabase Postgres, optional Supabase Storage, optional Supabase Auth, and optional Supabase Realtime.

Current status:

- `packages/provider-supabase` boundary exists.
- The [fresh 90-case provider packet](results/2026/11-07/supabase-provider-attempt-8.json)
  passed, including local regressions, Supabase SQL and actual private Storage/Auth.
- Real database/private Storage selection is implemented with healthy-only
  caching and failed persistence initialization cleanup. Application TLS/browser
  verification and actual hosted acceptance remain pending.

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
