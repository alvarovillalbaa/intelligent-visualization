# Security

Please report security issues privately to the repository maintainers.

Important security boundaries:

- Server-only provider credentials must never be exposed through `NEXT_PUBLIC_*`.
- Provider SDKs must not leak into UI code.
- Published artifacts must not execute model-generated scripts.
- Private source files require provider-neutral access checks.
- Cloudflare Worker requests must be signed before the D1 provider is enabled.
