import type { PostgresDatabase } from "./database"
import { postgresSchema, type PostgresSchema } from "./context"

export const LIFECYCLE_VERSION = 2
export const LIFECYCLE_MIGRATION_NAME = "terminal_visualization_removal_v2"
export const LIFECYCLE_CHILD_TABLES = ["visualization_versions", "visualization_checkpoints", "visualization_sources", "visualization_assets",
  "review_requests", "review_comments", "analytics_events", "leads", "experiments", "experiment_variants", "experiment_exposures", "workflow_runs"] as const

export function lifecycleFunctions(schema: PostgresSchema) {
  const s = postgresSchema(schema)
  return [
    { name: "iv_lifecycle_references_v2", arguments: "payload JSONB", language: "sql", returns: "SETOF TEXT", volatility: "STABLE", body: `
SELECT DISTINCT id FROM (
  SELECT payload->>'visualization_id' AS id
  UNION ALL SELECT id FROM ${s}.visualizations WHERE public_id = payload->>'public_id'
  UNION ALL SELECT visualization_id FROM ${s}.visualization_versions WHERE id IN (payload->>'version_id', payload->>'fallback_version_id')
  UNION ALL SELECT visualization_id FROM ${s}.review_requests WHERE id = payload->>'review_request_id'
  UNION ALL SELECT visualization_id FROM ${s}.experiments WHERE id = payload->>'experiment_id'
  UNION ALL SELECT e.visualization_id FROM ${s}.experiment_variants v JOIN ${s}.experiments e ON e.id = v.experiment_id WHERE v.id = payload->>'variant_id'
) references_to_parent WHERE id IS NOT NULL
` },
    { name: "iv_lifecycle_statement_v2", arguments: "", language: "plpgsql", returns: "TRIGGER", volatility: "VOLATILE", body: `
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(TG_TABLE_SCHEMA || ':visualization-lifecycle-v2', 0));
  IF TG_OP = 'TRUNCATE' AND EXISTS (SELECT 1 FROM ${s}.visualizations WHERE status = 'removed') THEN
    RAISE EXCEPTION 'Removed visualization history is retained' USING ERRCODE = '55000';
  END IF;
  RETURN NULL;
END
` },
    { name: "iv_removed_parent_v2", arguments: "", language: "plpgsql", returns: "TRIGGER", volatility: "VOLATILE", body: `
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'removed' THEN RAISE EXCEPTION 'Removed visualization history is retained' USING ERRCODE = '55000'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'removed' AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
      RAISE EXCEPTION 'Removed visualization is terminal' USING ERRCODE = '55000';
    END IF;
    IF OLD.status <> 'removed' AND NEW.status = 'removed'
      AND (to_jsonb(NEW) - 'status' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'updated_at') THEN
      RAISE EXCEPTION 'Removal must retain the original visualization' USING ERRCODE = '55000';
    END IF;
  END IF;
  IF NEW.status = 'removed' THEN
    IF NEW.kind NOT IN ('course', 'report') OR EXISTS (
      SELECT 1 FROM ${s}.visualization_versions WHERE visualization_id = NEW.id AND status = 'published'
    ) THEN RAISE EXCEPTION 'Removal requires a canonical draft and revoked publications' USING ERRCODE = '55000'; END IF;
  END IF;
  RETURN NEW;
END
` },
    { name: "iv_removed_child_v2", arguments: "", language: "plpgsql", returns: "TRIGGER", volatility: "VOLATILE", body: `
DECLARE before_row JSONB := '{}'::JSONB; after_row JSONB := '{}'::JSONB; parent_record RECORD;
BEGIN
  IF TG_OP <> 'INSERT' THEN before_row := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN after_row := to_jsonb(NEW); END IF;
  FOR parent_record IN SELECT p.id, p.status FROM ${s}.visualizations p WHERE p.id IN (
    SELECT * FROM ${s}.iv_lifecycle_references_v2(before_row)
    UNION SELECT * FROM ${s}.iv_lifecycle_references_v2(after_row)
  ) ORDER BY p.id FOR UPDATE LOOP
    IF parent_record.status = 'removed' THEN
      RAISE EXCEPTION 'Removed visualization history is retained' USING ERRCODE = '55000';
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
` },
  ] as const
}

// Version 1 remains immutable. Both providers install these exact new definitions.
export function lifecycleMigration(schema: PostgresSchema) {
  const s = postgresSchema(schema)
  const statements: string[] = []
  for (const fn of lifecycleFunctions(s)) {
    statements.push(`CREATE FUNCTION ${s}.${fn.name}(${fn.arguments}) RETURNS ${fn.returns} LANGUAGE ${fn.language} ${fn.volatility} SECURITY INVOKER SET search_path = pg_catalog AS $lifecycle_v2$${fn.body}$lifecycle_v2$`)
    const signature = fn.arguments ? "JSONB" : ""
    statements.push(`REVOKE ALL ON FUNCTION ${s}.${fn.name}(${signature}) FROM PUBLIC`)
    if (s === "intelligent_visualization_supabase") statements.push(`GRANT EXECUTE ON FUNCTION ${s}.${fn.name}(${signature}) TO iv_runtime`)
  }
  statements.push(`ALTER TABLE ${s}.visualizations ADD CONSTRAINT iv_visualization_status_v2 CHECK (status IN ('draft', 'preview', 'published', 'archived', 'removed'))`)
  for (const table of ["visualizations", ...LIFECYCLE_CHILD_TABLES]) {
    statements.push(`CREATE TRIGGER iv_lifecycle_statement_v2 BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON ${s}.${table} FOR EACH STATEMENT EXECUTE FUNCTION ${s}.iv_lifecycle_statement_v2()`)
    const fn = table === "visualizations" ? "iv_removed_parent_v2" : "iv_removed_child_v2"
    statements.push(`CREATE TRIGGER ${fn} BEFORE INSERT OR UPDATE OR DELETE ON ${s}.${table} FOR EACH ROW EXECUTE FUNCTION ${s}.${fn}()`)
  }
  return { version: LIFECYCLE_VERSION, name: LIFECYCLE_MIGRATION_NAME, statements }
}

// Acquire before explicit row locks, including cached command reads. Statement
// triggers serialize all linked DML before it can take its own tuple locks.
export async function lockVisualizationLifecycle(database: PostgresDatabase, schema: PostgresSchema) {
  await database.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`${postgresSchema(schema)}:visualization-lifecycle-v2`])
}
