import type { PostgresDatabase } from "@/packages/provider-postgres/database"
import { lifecycleFunctions, LIFECYCLE_CHILD_TABLES, LIFECYCLE_MIGRATION_NAME, LIFECYCLE_VERSION } from "@/packages/provider-postgres/lifecycle-v2"

export const SUPABASE_SCHEMA = "intelligent_visualization_supabase"
export const SUPABASE_SCHEMA_VERSION = LIFECYCLE_VERSION
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
      EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member = r.oid
        OR (m.roleid = r.oid AND NOT (m.member = n.nspowner AND m.admin_option
          AND NOT m.inherit_option AND NOT m.set_option))) AS memberships,
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
    if (versions.length !== 2 || versions[0].version !== 1 || versions[0].name !== SUPABASE_MIGRATION_NAME
      || versions[1].version !== SUPABASE_SCHEMA_VERSION || versions[1].name !== LIFECYCLE_MIGRATION_NAME) invalidSchema()
    const functions = (await transaction.query(`SELECT p.proname, p.prosrc, p.prosecdef, p.proconfig, p.proretset, p.pronargs,
      p.provolatile, p.prorettype::integer AS return_type, p.proargtypes::text AS argument_types, p.pronargdefaults, p.prokind,
      p.provariadic::integer AS variadic_type, l.lanname, p.proowner = n.nspowner AS schema_owner,
      has_function_privilege($2, p.oid, 'EXECUTE') AS can_execute,
      EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = 0 OR a.is_grantable AND a.grantee = (SELECT oid FROM pg_roles WHERE rolname = $2)) AS public_access,
      EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname IN ('anon', 'authenticated') AND has_function_privilege(r.oid, p.oid, 'EXECUTE')) AS browser_access
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_language l ON l.oid = p.prolang
      WHERE n.nspname = $1 AND p.proname = ANY($3::text[]) ORDER BY p.proname`,
    [SUPABASE_SCHEMA, SUPABASE_RUNTIME_ROLE, lifecycleFunctions(SUPABASE_SCHEMA).map((fn) => fn.name)])).rows
    const definitions = [...lifecycleFunctions(SUPABASE_SCHEMA)].sort((a, b) => a.name.localeCompare(b.name))
    if (functions.length !== definitions.length || functions.some((row, index) => {
      const fn = definitions[index], references = fn.name === "iv_lifecycle_references_v2"
      return row.proname !== fn.name || row.prosrc !== fn.body || row.prosecdef !== false
        || JSON.stringify(row.proconfig) !== JSON.stringify(["search_path=pg_catalog"]) || row.proretset !== references
        || row.pronargs !== (references ? 1 : 0) || row.argument_types !== (references ? "3802" : "")
        || row.return_type !== (references ? 25 : 2279) || row.provolatile !== (references ? "s" : "v")
        || row.pronargdefaults !== 0 || row.prokind !== "f" || row.variadic_type !== 0 || row.lanname !== fn.language
        || row.schema_owner !== true || row.can_execute !== true || row.public_access !== false || row.browser_access !== false
    })) invalidSchema()
    const triggers = (await transaction.query(`SELECT c.relname, t.tgname, t.tgtype::integer AS trigger_type, t.tgenabled, p.proname,
      t.tgisinternal, t.tgconstraint = 0 AS ordinary, t.tgnargs = 0 AND octet_length(t.tgargs) = 0 AS no_arguments,
      t.tgqual IS NULL AS unconditional, p.pronamespace = n.oid AS same_schema FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_proc p ON p.oid = t.tgfoid
      WHERE n.nspname = $1 AND NOT t.tgisinternal`, [SUPABASE_SCHEMA])).rows
    const tablesWithFences = ["visualizations", ...LIFECYCLE_CHILD_TABLES]
    if (triggers.length !== 2 * tablesWithFences.length || tablesWithFences.some((table) => {
      const rows = triggers.filter((row) => row.relname === table)
      const parent = table === "visualizations" ? "iv_removed_parent_v2" : "iv_removed_child_v2"
      return rows.length !== 2 || !rows.some((row) => row.tgname === "iv_lifecycle_statement_v2" && row.proname === row.tgname && row.trigger_type === 62)
        || !rows.some((row) => row.tgname === parent && row.proname === parent && row.trigger_type === 31)
        || rows.some((row) => row.tgenabled !== "O" || row.tgisinternal !== false || row.ordinary !== true || row.no_arguments !== true || row.unconditional !== true || row.same_schema !== true)
    })) invalidSchema()
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
