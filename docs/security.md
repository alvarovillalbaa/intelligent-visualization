# Security

Implemented in the current slice:

- Production signing secret no longer falls back to provider credentials.
- Local storage rejects path traversal.
- Artifact compiler escapes HTML and rejects unsafe CTA protocols.
- Provider selection fails closed for unimplemented providers.

Remaining work:

- Full RBAC service refactor.
- CSRF/rate-limit/audit hardening.
- Hosted database/storage roles and provider contract acceptance.
- Full artifact CSP integration.

The local database uses a dedicated schema and parameterized queries. Startup
refuses unversioned or unknown migration identities instead of adopting existing
tables. Backups contain authentication hashes and legacy bearer links; export
directories/files are owner-only and sessions are omitted. Protect the complete
backup and its object directories. This is local data handling, not proof of
hosted RLS or multi-user provider isolation.
