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

The current database provider is local PostgreSQL. Supabase remains a reserved,
unimplemented boundary. Existing files or external deployments are not modified
by the source migration. See [the upgrade and data boundaries](postgres-migration.md).
