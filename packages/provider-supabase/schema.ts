import type { PostgresDatabase } from "@/packages/provider-postgres/database"

export const SUPABASE_SCHEMA = "intelligent_visualization_supabase"
export const SUPABASE_SCHEMA_VERSION = 1
export const SUPABASE_MIGRATION_NAME = "initial_supabase_private_visualization_schema"
export const SUPABASE_RUNTIME_ROLE = "iv_runtime"
export const SUPABASE_TABLES = [
  "analytics_events", "experiment_exposures", "experiment_variants", "experiments", "idempotency_records", "invites",
  "leads", "legacy_repository_state", "review_comments", "review_requests", "schema_migrations", "sessions", "team_memberships",
  "teams", "users", "visualization_assets", "visualization_checkpoints", "visualization_sources", "visualization_versions", "visualizations",
  "workflow_runs", "workspaces",
] as const

const initialized = new WeakMap<PostgresDatabase, Promise<void>>()
function invalidSchema(): never {
  throw new Error("Supabase private schema, migration or runtime role is unavailable or does not match the installed provider policy.")
}

export function invalidateSupabaseDatabase(database: PostgresDatabase) { initialized.delete(database) }

// Metadata validation only. Migration ownership and credentials never enter a request.
async function validate(database: PostgresDatabase): Promise<void> {
  await database.transaction(async (transaction) => {
    const role = (await transaction.query(`SELECT current_user AS current_role, session_user AS session_role,
      r.oid, r.rolsuper, r.rolcreaterole, r.rolcreatedb, r.rolreplication, r.rolbypassrls, r.rolinherit, r.rolcanlogin,
      EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member = r.oid OR m.roleid = r.oid) AS memberships,
      EXISTS (SELECT 1 FROM pg_catalog.pg_namespace owned WHERE owned.nspowner = r.oid)
        OR EXISTS (SELECT 1 FROM pg_catalog.pg_class owned WHERE owned.relowner = r.oid) AS owns_objects,
      has_schema_privilege(r.oid, n.oid, 'USAGE') AS schema_usage,
      has_schema_privilege(r.oid, n.oid, 'CREATE') AS schema_create,
      EXISTS (SELECT 1 FROM aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) a
        WHERE a.grantee = 0 OR (a.grantee = r.oid AND a.is_grantable)) AS public_schema_access
      FROM pg_catalog.pg_roles r JOIN pg_catalog.pg_namespace n ON n.nspname = $1 WHERE r.rolname = $2`,
    [SUPABASE_SCHEMA, SUPABASE_RUNTIME_ROLE])).rows[0]
    if (!role || role.current_role !== SUPABASE_RUNTIME_ROLE || role.session_role !== SUPABASE_RUNTIME_ROLE || role.rolcanlogin !== true
      || role.schema_usage !== true || ["rolsuper", "rolcreaterole", "rolcreatedb", "rolreplication", "rolbypassrls", "rolinherit", "memberships", "owns_objects", "schema_create", "public_schema_access"].some((key) => role[key] !== false)) invalidSchema()
    const browserRoles = (await transaction.query(`SELECT rolname,
      has_schema_privilege(oid, $1, 'USAGE') AS schema_usage, has_schema_privilege(oid, $1, 'CREATE') AS schema_create
      FROM pg_catalog.pg_roles WHERE rolname IN ('anon', 'authenticated') ORDER BY rolname`, [SUPABASE_SCHEMA])).rows
    if (browserRoles.length !== 2 || browserRoles.some((row) => row.schema_usage !== false || row.schema_create !== false)) invalidSchema()
    const tables = (await transaction.query(`SELECT c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity,
      has_table_privilege($2, c.oid, 'SELECT') AS can_select,
      has_table_privilege($2, c.oid, 'INSERT') AS can_insert,
      has_table_privilege($2, c.oid, 'UPDATE') AS can_update,
      has_table_privilege($2, c.oid, 'DELETE') AS can_delete,
      has_table_privilege($2, c.oid, 'TRUNCATE') OR has_table_privilege($2, c.oid, 'REFERENCES')
        OR has_table_privilege($2, c.oid, 'TRIGGER') AS extra_privileges,
      EXISTS (SELECT 1 FROM aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
        WHERE a.grantee = 0 OR (a.grantee = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = $2) AND a.is_grantable)) AS public_access,
      EXISTS (SELECT 1 FROM pg_catalog.pg_roles browser WHERE browser.rolname IN ('anon', 'authenticated')
        AND (has_table_privilege(browser.oid, c.oid, 'SELECT') OR has_table_privilege(browser.oid, c.oid, 'INSERT')
          OR has_table_privilege(browser.oid, c.oid, 'UPDATE') OR has_table_privilege(browser.oid, c.oid, 'DELETE')
          OR has_table_privilege(browser.oid, c.oid, 'TRUNCATE') OR has_table_privilege(browser.oid, c.oid, 'REFERENCES')
          OR has_table_privilege(browser.oid, c.oid, 'TRIGGER'))) AS browser_access
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f') ORDER BY c.relname`,
    [SUPABASE_SCHEMA, SUPABASE_RUNTIME_ROLE])).rows
    if (tables.length !== SUPABASE_TABLES.length || tables.some((row, index) => row.relname !== SUPABASE_TABLES[index]
      || row.relkind !== "r" || row.relrowsecurity !== true || row.relforcerowsecurity !== true || row.can_select !== true
      || ["extra_privileges", "public_access", "browser_access"].some((key) => row[key] !== false)
      || ["can_insert", "can_update", "can_delete"].some((key) => row[key] !== (row.relname !== "schema_migrations")))) invalidSchema()
    const policies = (await transaction.query(`SELECT tablename, policyname, permissive, roles::text[] AS roles, cmd, qual, with_check
      FROM pg_catalog.pg_policies WHERE schemaname = $1 ORDER BY tablename, policyname`, [SUPABASE_SCHEMA])).rows
    if (policies.length !== SUPABASE_TABLES.length || policies.some((row, index) => {
      const lineage = row.tablename === "schema_migrations"
      return row.tablename !== SUPABASE_TABLES[index] || row.policyname !== (lineage ? "iv_runtime_read_lineage" : "iv_runtime_backend")
        || row.permissive !== "PERMISSIVE" || !Array.isArray(row.roles) || row.roles.length !== 1 || row.roles[0] !== SUPABASE_RUNTIME_ROLE
        || row.cmd !== (lineage ? "SELECT" : "ALL") || row.qual !== "true" || row.with_check !== (lineage ? null : "true")
    })) invalidSchema()
    const versions = (await transaction.query(`SELECT version, name FROM ${SUPABASE_SCHEMA}.schema_migrations ORDER BY version`)).rows
    if (versions.length !== 1 || versions[0].version !== SUPABASE_SCHEMA_VERSION || versions[0].name !== SUPABASE_MIGRATION_NAME) invalidSchema()
    const state = (await transaction.query(`SELECT key FROM ${SUPABASE_SCHEMA}.legacy_repository_state ORDER BY key`)).rows
    if (state.length !== 1 || state[0].key !== "legacy-slides") invalidSchema()
  })
}

export async function ensureSupabaseDatabase(database: PostgresDatabase, recheck = false): Promise<void> {
  // A health recheck must not replace a resolved installation promise while an
  // active transaction still needs it: a one-client pool would otherwise deadlock.
  if (recheck) {
    try { await validate(database) } catch { initialized.delete(database); invalidSchema() }
    if (!initialized.has(database)) initialized.set(database, Promise.resolve())
    return
  }
  let initialization = initialized.get(database)
  if (!initialization) {
    initialization = validate(database)
    initialized.set(database, initialization)
  }
  try { await initialization } catch {
    if (initialized.get(database) === initialization) initialized.delete(database)
    invalidSchema()
  }
}
