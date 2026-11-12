BEGIN;
DO $preflight$
BEGIN
  IF current_setting('iv.lifecycle_v2_retired', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Stop v1 apps, jobs and backup tools; acknowledge retirement before upgrading';
  END IF;
  IF (SELECT count(*) FROM intelligent_visualization_supabase.schema_migrations) <> 1 OR NOT EXISTS (
    SELECT 1 FROM intelligent_visualization_supabase.schema_migrations WHERE version = 1 AND name = 'initial_supabase_private_visualization_schema'
  ) THEN RAISE EXCEPTION 'Requires the exact v1 schema'; END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_stat_activity WHERE datid = (SELECT oid FROM pg_catalog.pg_database WHERE datname = current_database())
    AND pid <> pg_backend_pid() AND usename = 'iv_runtime') THEN RAISE EXCEPTION 'Runtime connections remain; migration refused'; END IF;
END
$preflight$;
LOCK TABLE intelligent_visualization_supabase.visualizations, intelligent_visualization_supabase.visualization_versions, intelligent_visualization_supabase.visualization_checkpoints, intelligent_visualization_supabase.visualization_sources, intelligent_visualization_supabase.visualization_assets, intelligent_visualization_supabase.review_requests, intelligent_visualization_supabase.review_comments, intelligent_visualization_supabase.analytics_events, intelligent_visualization_supabase.leads, intelligent_visualization_supabase.experiments, intelligent_visualization_supabase.experiment_variants, intelligent_visualization_supabase.experiment_exposures, intelligent_visualization_supabase.workflow_runs IN ACCESS EXCLUSIVE MODE;
CREATE FUNCTION intelligent_visualization_supabase.iv_lifecycle_references_v2(payload JSONB) RETURNS SETOF TEXT LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog AS $lifecycle_v2$
SELECT DISTINCT id FROM (
  SELECT payload->>'visualization_id' AS id
  UNION ALL SELECT id FROM intelligent_visualization_supabase.visualizations WHERE public_id = payload->>'public_id'
  UNION ALL SELECT visualization_id FROM intelligent_visualization_supabase.visualization_versions WHERE id IN (payload->>'version_id', payload->>'fallback_version_id')
  UNION ALL SELECT visualization_id FROM intelligent_visualization_supabase.review_requests WHERE id = payload->>'review_request_id'
  UNION ALL SELECT visualization_id FROM intelligent_visualization_supabase.experiments WHERE id = payload->>'experiment_id'
  UNION ALL SELECT e.visualization_id FROM intelligent_visualization_supabase.experiment_variants v JOIN intelligent_visualization_supabase.experiments e ON e.id = v.experiment_id WHERE v.id = payload->>'variant_id'
) references_to_parent WHERE id IS NOT NULL
$lifecycle_v2$;
REVOKE ALL ON FUNCTION intelligent_visualization_supabase.iv_lifecycle_references_v2(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION intelligent_visualization_supabase.iv_lifecycle_references_v2(JSONB) TO iv_runtime;
CREATE FUNCTION intelligent_visualization_supabase.iv_lifecycle_statement_v2() RETURNS TRIGGER LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = pg_catalog AS $lifecycle_v2$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(TG_TABLE_SCHEMA || ':visualization-lifecycle-v2', 0));
  IF TG_OP = 'TRUNCATE' AND EXISTS (SELECT 1 FROM intelligent_visualization_supabase.visualizations WHERE status = 'removed') THEN
    RAISE EXCEPTION 'Removed visualization history is retained' USING ERRCODE = '55000';
  END IF;
  RETURN NULL;
END
$lifecycle_v2$;
REVOKE ALL ON FUNCTION intelligent_visualization_supabase.iv_lifecycle_statement_v2() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION intelligent_visualization_supabase.iv_lifecycle_statement_v2() TO iv_runtime;
CREATE FUNCTION intelligent_visualization_supabase.iv_removed_parent_v2() RETURNS TRIGGER LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = pg_catalog AS $lifecycle_v2$
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
      SELECT 1 FROM intelligent_visualization_supabase.visualization_versions WHERE visualization_id = NEW.id AND status = 'published'
    ) THEN RAISE EXCEPTION 'Removal requires a canonical draft and revoked publications' USING ERRCODE = '55000'; END IF;
  END IF;
  RETURN NEW;
END
$lifecycle_v2$;
REVOKE ALL ON FUNCTION intelligent_visualization_supabase.iv_removed_parent_v2() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION intelligent_visualization_supabase.iv_removed_parent_v2() TO iv_runtime;
CREATE FUNCTION intelligent_visualization_supabase.iv_removed_child_v2() RETURNS TRIGGER LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = pg_catalog AS $lifecycle_v2$
DECLARE before_row JSONB := '{}'::JSONB; after_row JSONB := '{}'::JSONB; parent_record RECORD;
BEGIN
  IF TG_OP <> 'INSERT' THEN before_row := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN after_row := to_jsonb(NEW); END IF;
  FOR parent_record IN SELECT p.id, p.status FROM intelligent_visualization_supabase.visualizations p WHERE p.id IN (
    SELECT * FROM intelligent_visualization_supabase.iv_lifecycle_references_v2(before_row)
    UNION SELECT * FROM intelligent_visualization_supabase.iv_lifecycle_references_v2(after_row)
  ) ORDER BY p.id FOR UPDATE LOOP
    IF parent_record.status = 'removed' THEN
      RAISE EXCEPTION 'Removed visualization history is retained' USING ERRCODE = '55000';
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$lifecycle_v2$;
REVOKE ALL ON FUNCTION intelligent_visualization_supabase.iv_removed_child_v2() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION intelligent_visualization_supabase.iv_removed_child_v2() TO iv_runtime;
ALTER TABLE intelligent_visualization_supabase.visualizations ADD CONSTRAINT iv_visualization_status_v2 CHECK (status IN ('draft', 'preview', 'published', 'archived', 'removed'));
CREATE TRIGGER iv_lifecycle_statement_v2 BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON intelligent_visualization_supabase.visualizations FOR EACH STATEMENT EXECUTE FUNCTION intelligent_visualization_supabase.iv_lifecycle_statement_v2();
CREATE TRIGGER iv_removed_parent_v2 BEFORE INSERT OR UPDATE OR DELETE ON intelligent_visualization_supabase.visualizations FOR EACH ROW EXECUTE FUNCTION intelligent_visualization_supabase.iv_removed_parent_v2();
CREATE TRIGGER iv_lifecycle_statement_v2 BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON intelligent_visualization_supabase.visualization_versions FOR EACH STATEMENT EXECUTE FUNCTION intelligent_visualization_supabase.iv_lifecycle_statement_v2();
CREATE TRIGGER iv_removed_child_v2 BEFORE INSERT OR UPDATE OR DELETE ON intelligent_visualization_supabase.visualization_versions FOR EACH ROW EXECUTE FUNCTION intelligent_visualization_supabase.iv_removed_child_v2();
CREATE TRIGGER iv_lifecycle_statement_v2 BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON intelligent_visualization_supabase.visualization_checkpoints FOR EACH STATEMENT EXECUTE FUNCTION intelligent_visualization_supabase.iv_lifecycle_statement_v2();
CREATE TRIGGER iv_removed_child_v2 BEFORE INSERT OR UPDATE OR DELETE ON intelligent_visualization_supabase.visualization_checkpoints FOR EACH ROW EXECUTE FUNCTION intelligent_visualization_supabase.iv_removed_child_v2();
CREATE TRIGGER iv_lifecycle_statement_v2 BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON intelligent_visualization_supabase.visualization_sources FOR EACH STATEMENT EXECUTE FUNCTION intelligent_visualization_supabase.iv_lifecycle_statement_v2();
CREATE TRIGGER iv_removed_child_v2 BEFORE INSERT OR UPDATE OR DELETE ON intelligent_visualization_supabase.visualization_sources FOR EACH ROW EXECUTE FUNCTION intelligent_visualization_supabase.iv_removed_child_v2();
CREATE TRIGGER iv_lifecycle_statement_v2 BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON intelligent_visualization_supabase.visualization_assets FOR EACH STATEMENT EXECUTE FUNCTION intelligent_visualization_supabase.iv_lifecycle_statement_v2();
CREATE TRIGGER iv_removed_child_v2 BEFORE INSERT OR UPDATE OR DELETE ON intelligent_visualization_supabase.visualization_assets FOR EACH ROW EXECUTE FUNCTION intelligent_visualization_supabase.iv_removed_child_v2();
CREATE TRIGGER iv_lifecycle_statement_v2 BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON intelligent_visualization_supabase.review_requests FOR EACH STATEMENT EXECUTE FUNCTION intelligent_visualization_supabase.iv_lifecycle_statement_v2();
CREATE TRIGGER iv_removed_child_v2 BEFORE INSERT OR UPDATE OR DELETE ON intelligent_visualization_supabase.review_requests FOR EACH ROW EXECUTE FUNCTION intelligent_visualization_supabase.iv_removed_child_v2();
CREATE TRIGGER iv_lifecycle_statement_v2 BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON intelligent_visualization_supabase.review_comments FOR EACH STATEMENT EXECUTE FUNCTION intelligent_visualization_supabase.iv_lifecycle_statement_v2();
CREATE TRIGGER iv_removed_child_v2 BEFORE INSERT OR UPDATE OR DELETE ON intelligent_visualization_supabase.review_comments FOR EACH ROW EXECUTE FUNCTION intelligent_visualization_supabase.iv_removed_child_v2();
CREATE TRIGGER iv_lifecycle_statement_v2 BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON intelligent_visualization_supabase.analytics_events FOR EACH STATEMENT EXECUTE FUNCTION intelligent_visualization_supabase.iv_lifecycle_statement_v2();
CREATE TRIGGER iv_removed_child_v2 BEFORE INSERT OR UPDATE OR DELETE ON intelligent_visualization_supabase.analytics_events FOR EACH ROW EXECUTE FUNCTION intelligent_visualization_supabase.iv_removed_child_v2();
CREATE TRIGGER iv_lifecycle_statement_v2 BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON intelligent_visualization_supabase.leads FOR EACH STATEMENT EXECUTE FUNCTION intelligent_visualization_supabase.iv_lifecycle_statement_v2();
CREATE TRIGGER iv_removed_child_v2 BEFORE INSERT OR UPDATE OR DELETE ON intelligent_visualization_supabase.leads FOR EACH ROW EXECUTE FUNCTION intelligent_visualization_supabase.iv_removed_child_v2();
CREATE TRIGGER iv_lifecycle_statement_v2 BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON intelligent_visualization_supabase.experiments FOR EACH STATEMENT EXECUTE FUNCTION intelligent_visualization_supabase.iv_lifecycle_statement_v2();
CREATE TRIGGER iv_removed_child_v2 BEFORE INSERT OR UPDATE OR DELETE ON intelligent_visualization_supabase.experiments FOR EACH ROW EXECUTE FUNCTION intelligent_visualization_supabase.iv_removed_child_v2();
CREATE TRIGGER iv_lifecycle_statement_v2 BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON intelligent_visualization_supabase.experiment_variants FOR EACH STATEMENT EXECUTE FUNCTION intelligent_visualization_supabase.iv_lifecycle_statement_v2();
CREATE TRIGGER iv_removed_child_v2 BEFORE INSERT OR UPDATE OR DELETE ON intelligent_visualization_supabase.experiment_variants FOR EACH ROW EXECUTE FUNCTION intelligent_visualization_supabase.iv_removed_child_v2();
CREATE TRIGGER iv_lifecycle_statement_v2 BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON intelligent_visualization_supabase.experiment_exposures FOR EACH STATEMENT EXECUTE FUNCTION intelligent_visualization_supabase.iv_lifecycle_statement_v2();
CREATE TRIGGER iv_removed_child_v2 BEFORE INSERT OR UPDATE OR DELETE ON intelligent_visualization_supabase.experiment_exposures FOR EACH ROW EXECUTE FUNCTION intelligent_visualization_supabase.iv_removed_child_v2();
CREATE TRIGGER iv_lifecycle_statement_v2 BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON intelligent_visualization_supabase.workflow_runs FOR EACH STATEMENT EXECUTE FUNCTION intelligent_visualization_supabase.iv_lifecycle_statement_v2();
CREATE TRIGGER iv_removed_child_v2 BEFORE INSERT OR UPDATE OR DELETE ON intelligent_visualization_supabase.workflow_runs FOR EACH ROW EXECUTE FUNCTION intelligent_visualization_supabase.iv_removed_child_v2();
INSERT INTO intelligent_visualization_supabase.schema_migrations (version, name, applied_at) VALUES (2, 'terminal_visualization_removal_v2', now());
COMMIT;
