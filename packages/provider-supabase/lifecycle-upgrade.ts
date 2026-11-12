import { lifecycleMigration, LIFECYCLE_MIGRATION_NAME, LIFECYCLE_CHILD_TABLES } from "@/packages/provider-postgres/lifecycle-v2"
import { SUPABASE_SCHEMA, SUPABASE_MIGRATION_NAME } from "./schema"

// SQL output only. Operators apply this with migration-owner credentials after
// stopping old apps, workers and backup tools; request handlers never run it.
export function hostedLifecycleUpgradeSql() {
  const migration = lifecycleMigration(SUPABASE_SCHEMA)
  return `BEGIN;
DO $preflight$
BEGIN
  IF current_setting('iv.lifecycle_v2_retired', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Stop v1 apps, jobs and backup tools; acknowledge retirement before upgrading';
  END IF;
  IF (SELECT count(*) FROM ${SUPABASE_SCHEMA}.schema_migrations) <> 1 OR NOT EXISTS (
    SELECT 1 FROM ${SUPABASE_SCHEMA}.schema_migrations WHERE version = 1 AND name = '${SUPABASE_MIGRATION_NAME}'
  ) THEN RAISE EXCEPTION 'Requires the exact v1 schema'; END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_stat_activity WHERE datid = (SELECT oid FROM pg_catalog.pg_database WHERE datname = current_database())
    AND pid <> pg_backend_pid() AND usename = 'iv_runtime') THEN RAISE EXCEPTION 'Runtime connections remain; migration refused'; END IF;
END
$preflight$;
LOCK TABLE ${["visualizations", ...LIFECYCLE_CHILD_TABLES].map((table) => `${SUPABASE_SCHEMA}.${table}`).join(", ")} IN ACCESS EXCLUSIVE MODE;
${migration.statements.join(";\n")};
INSERT INTO ${SUPABASE_SCHEMA}.schema_migrations (version, name, applied_at) VALUES (2, '${LIFECYCLE_MIGRATION_NAME}', now());
COMMIT;
`
}
