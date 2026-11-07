# Supabase

Supabase support is planned as a provider-contract adapter over Supabase Postgres, optional Supabase Storage, optional Supabase Auth, and optional Supabase Realtime.

Current status:

- `packages/provider-supabase` boundary exists.
- Adapter, migration, private Storage and disposable-service checks are authored
  as an implementation candidate. Provider and hosted acceptance remain pending;
  application selection still fails closed.

Portable auth remains the default for Supabase persistence.

The dedicated `iv_runtime` role must have no outgoing memberships, ownership or
elevated role attributes. An incoming grant is allowed only to the exact private
schema owner with ADMIN true, INHERIT false and SET false. The owner already
controls schema DDL; this is not a general administrator or membership exemption.
Other incoming grants, including admin-only grants to an unrelated role, remain
rejected. Browser schema/RLS and application authorization requirements remain.

The [actual catalog diagnostic](results/2026/11-07/supabase-provider-diagnostic-3.md)
observed the owner grant while the original validator refused it. The narrow
correction and a real untrusted admin-only grant check are candidates for a new
90-case run; no migration or lineage is changed. Diagnostic completion is not
provider acceptance, hosted support or zero global database access.
