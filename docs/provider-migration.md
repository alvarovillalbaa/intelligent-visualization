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

Current executable tooling supports local and selected private Supabase export,
verify and import. Objects require a separate storage backup.

Local PostgreSQL remains the default. Supabase selection is implemented with
separate [provider/application and hosted boundaries](supabase.md). The new
[terminal-removal lifecycle](workspace-removal.md) requires v2 tooling, an explicit
stopped-process migration of existing v1 databases and no old reader/writer/tool
restarts. V2 exports preserve tombstones and are refused by old importers; receipts
and active sessions remain excluded. Existing files and external deployments are
not changed by source publication. See [the PostgreSQL boundaries](postgres-migration.md).
