# Security

Implemented in the current slice:

- Production signing secret no longer falls back to provider credentials.
- Local storage rejects path traversal.
- Artifact compiler escapes HTML and rejects unsafe CTA protocols.
- Provider selection fails closed for unimplemented providers.

Remaining work:

- Full RBAC service refactor.
- CSRF/rate-limit/audit hardening.
- Signed Cloudflare Worker requests.
- Provider SDK leakage gate after legacy Convex repository removal.
- Full artifact CSP integration.
