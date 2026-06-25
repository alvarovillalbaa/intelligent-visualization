# Provider Migration

Provider switching is explicit:

1. Freeze writes.
2. Export from the source provider.
3. Verify checksums.
4. Initialize the destination provider.
5. Import.
6. Verify entity counts and hashes.
7. Verify public routes and permissions.
8. Switch environment.
9. Run smoke tests.
10. Reopen writes.

Current executable tooling supports local export, verify, and import.

Convex, Supabase, and Cloudflare import/export adapters remain to be implemented.
