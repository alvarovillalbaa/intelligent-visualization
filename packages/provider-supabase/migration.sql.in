-- Hosted application schema v1. Use only a Supabase CLI-generated migration filename.
-- Apply under the reviewed migration role, never iv_runtime. No password/demo data.
-- Existing schemas and runtime roles are not adopted. Enable LOGIN/password only after migration.
DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'intelligent_visualization_supabase') THEN
    RAISE EXCEPTION 'An existing hosted application namespace cannot be adopted';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'iv_runtime') THEN
    RAISE EXCEPTION 'An existing hosted runtime role cannot be adopted';
  END IF;
  CREATE ROLE iv_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
END
$migration$;

CREATE SCHEMA intelligent_visualization_supabase;
REVOKE ALL ON SCHEMA intelligent_visualization_supabase FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA intelligent_visualization_supabase TO iv_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA intelligent_visualization_supabase REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA intelligent_visualization_supabase REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA intelligent_visualization_supabase REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

CREATE TABLE intelligent_visualization_supabase.schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL);

CREATE TABLE intelligent_visualization_supabase.users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL);

CREATE TABLE intelligent_visualization_supabase.sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL, FOREIGN KEY(user_id) REFERENCES intelligent_visualization_supabase.users(id) ON DELETE CASCADE);

CREATE TABLE intelligent_visualization_supabase.teams (id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, brand_json JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL);

CREATE TABLE intelligent_visualization_supabase.team_memberships (team_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL, PRIMARY KEY(team_id, user_id), FOREIGN KEY(team_id) REFERENCES intelligent_visualization_supabase.teams(id) ON DELETE CASCADE, FOREIGN KEY(user_id) REFERENCES intelligent_visualization_supabase.users(id) ON DELETE CASCADE);

CREATE TABLE intelligent_visualization_supabase.invites (id TEXT PRIMARY KEY, team_id TEXT NOT NULL, workspace_id TEXT NOT NULL, email TEXT NOT NULL, invited_name TEXT NOT NULL, role TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, status TEXT NOT NULL, invited_by_user_id TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL, accepted_at TIMESTAMPTZ, FOREIGN KEY(team_id) REFERENCES intelligent_visualization_supabase.teams(id) ON DELETE CASCADE);

CREATE TABLE intelligent_visualization_supabase.workspaces (id TEXT PRIMARY KEY, team_id TEXT NOT NULL, slug TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL, UNIQUE(team_id, slug), FOREIGN KEY(team_id) REFERENCES intelligent_visualization_supabase.teams(id) ON DELETE CASCADE);

CREATE TABLE intelligent_visualization_supabase.visualizations (id TEXT PRIMARY KEY, team_id TEXT NOT NULL, workspace_id TEXT NOT NULL, public_id TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, slug TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, status TEXT NOT NULL, schema_version INTEGER NOT NULL, draft_document_json JSONB NOT NULL, draft_hash TEXT NOT NULL, draft_revision INTEGER NOT NULL, theme_mode TEXT NOT NULL, created_by TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL, published_version_id TEXT, password_protected BOOLEAN NOT NULL DEFAULT FALSE, password_hash TEXT, UNIQUE(workspace_id, slug), FOREIGN KEY(team_id) REFERENCES intelligent_visualization_supabase.teams(id) ON DELETE CASCADE, FOREIGN KEY(workspace_id) REFERENCES intelligent_visualization_supabase.workspaces(id) ON DELETE CASCADE);

CREATE TABLE intelligent_visualization_supabase.visualization_versions (id TEXT PRIMARY KEY, visualization_id TEXT NOT NULL, label TEXT NOT NULL, status TEXT NOT NULL, schema_version INTEGER NOT NULL, document_json JSONB NOT NULL, document_hash TEXT NOT NULL, artifact_storage_key TEXT, artifact_url TEXT, artifact_hash TEXT, manifest_json JSONB NOT NULL, created_by TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL, password_hash TEXT, FOREIGN KEY(visualization_id) REFERENCES intelligent_visualization_supabase.visualizations(id) ON DELETE CASCADE);

CREATE TABLE intelligent_visualization_supabase.visualization_checkpoints (id TEXT PRIMARY KEY, visualization_id TEXT NOT NULL, title TEXT NOT NULL, summary TEXT NOT NULL, prompt TEXT NOT NULL, revision INTEGER NOT NULL, document_json JSONB NOT NULL, document_hash TEXT NOT NULL, created_by TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL, FOREIGN KEY(visualization_id) REFERENCES intelligent_visualization_supabase.visualizations(id) ON DELETE CASCADE);

CREATE TABLE intelligent_visualization_supabase.visualization_sources (id TEXT PRIMARY KEY, visualization_id TEXT NOT NULL, filename_or_url TEXT NOT NULL, mime TEXT NOT NULL, size_bytes BIGINT NOT NULL, storage_key TEXT NOT NULL, extraction_state TEXT NOT NULL, extracted_text TEXT, structured_tables_json JSONB NOT NULL, content_hash TEXT NOT NULL, provenance TEXT NOT NULL, warnings_json JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL, FOREIGN KEY(visualization_id) REFERENCES intelligent_visualization_supabase.visualizations(id) ON DELETE CASCADE);

CREATE TABLE intelligent_visualization_supabase.visualization_assets (id TEXT PRIMARY KEY, visualization_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, storage_key TEXT NOT NULL, url TEXT, content_type TEXT NOT NULL, size_bytes BIGINT NOT NULL, content_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL, FOREIGN KEY(visualization_id) REFERENCES intelligent_visualization_supabase.visualizations(id) ON DELETE CASCADE);

CREATE TABLE intelligent_visualization_supabase.review_requests (id TEXT PRIMARY KEY, visualization_id TEXT NOT NULL, version_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, title TEXT NOT NULL, status TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL, FOREIGN KEY(visualization_id) REFERENCES intelligent_visualization_supabase.visualizations(id) ON DELETE CASCADE, FOREIGN KEY(version_id) REFERENCES intelligent_visualization_supabase.visualization_versions(id) ON DELETE CASCADE);

CREATE TABLE intelligent_visualization_supabase.review_comments (id TEXT PRIMARY KEY, review_request_id TEXT NOT NULL, author_name TEXT NOT NULL, body TEXT NOT NULL, anchor_json JSONB NOT NULL, status TEXT NOT NULL, suggested_patch_json JSONB, parent_comment_id TEXT, created_at TIMESTAMPTZ NOT NULL, applied_at TIMESTAMPTZ, FOREIGN KEY(review_request_id) REFERENCES intelligent_visualization_supabase.review_requests(id) ON DELETE CASCADE);

CREATE TABLE intelligent_visualization_supabase.analytics_events (id TEXT PRIMARY KEY, visualization_id TEXT, public_id TEXT NOT NULL, version_id TEXT, type TEXT NOT NULL, node_id TEXT, node_kind TEXT, visitor_id TEXT NOT NULL, value TEXT, duration_ms INTEGER, created_at TIMESTAMPTZ NOT NULL);

CREATE TABLE intelligent_visualization_supabase.leads (id TEXT PRIMARY KEY, visualization_id TEXT, public_id TEXT NOT NULL, version_id TEXT, visitor_id TEXT, fields_json JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL);

CREATE TABLE intelligent_visualization_supabase.experiments (id TEXT PRIMARY KEY, visualization_id TEXT NOT NULL, name TEXT NOT NULL, question TEXT NOT NULL, status TEXT NOT NULL, fallback_version_id TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL, FOREIGN KEY(visualization_id) REFERENCES intelligent_visualization_supabase.visualizations(id) ON DELETE CASCADE);

CREATE TABLE intelligent_visualization_supabase.experiment_variants (id TEXT PRIMARY KEY, experiment_id TEXT NOT NULL, label TEXT NOT NULL, version_id TEXT NOT NULL, weight INTEGER NOT NULL CHECK (weight >= 0 AND weight <= 100), UNIQUE(experiment_id, version_id), FOREIGN KEY(experiment_id) REFERENCES intelligent_visualization_supabase.experiments(id) ON DELETE CASCADE);

CREATE TABLE intelligent_visualization_supabase.experiment_exposures (id TEXT PRIMARY KEY, experiment_id TEXT NOT NULL, visitor_id TEXT NOT NULL, variant_id TEXT NOT NULL, version_id TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL, UNIQUE(experiment_id, visitor_id), FOREIGN KEY(experiment_id) REFERENCES intelligent_visualization_supabase.experiments(id) ON DELETE CASCADE, FOREIGN KEY(variant_id) REFERENCES intelligent_visualization_supabase.experiment_variants(id) ON DELETE CASCADE);

CREATE TABLE intelligent_visualization_supabase.workflow_runs (id TEXT PRIMARY KEY, visualization_id TEXT, kind TEXT NOT NULL, status TEXT NOT NULL, input_json JSONB NOT NULL, output_json JSONB, error TEXT, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL);

CREATE TABLE intelligent_visualization_supabase.idempotency_records (key TEXT PRIMARY KEY, command TEXT NOT NULL, result_json JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL);

CREATE TABLE intelligent_visualization_supabase.legacy_repository_state (key TEXT PRIMARY KEY, payload JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL);

CREATE INDEX idx_sessions_token ON intelligent_visualization_supabase.sessions(token_hash);

CREATE INDEX idx_memberships_user ON intelligent_visualization_supabase.team_memberships(user_id);

CREATE INDEX idx_workspaces_team ON intelligent_visualization_supabase.workspaces(team_id);

CREATE INDEX idx_visualizations_workspace ON intelligent_visualization_supabase.visualizations(workspace_id, updated_at);

CREATE INDEX idx_versions_visualization ON intelligent_visualization_supabase.visualization_versions(visualization_id, created_at);

CREATE INDEX idx_checkpoints_visualization ON intelligent_visualization_supabase.visualization_checkpoints(visualization_id, created_at);

CREATE INDEX idx_events_visualization ON intelligent_visualization_supabase.analytics_events(visualization_id, created_at);

CREATE INDEX idx_leads_visualization ON intelligent_visualization_supabase.leads(visualization_id, created_at);

-- These policies authorize the private server role, not individual browser users.
DO $policy$
DECLARE relation_name TEXT;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'users', 'sessions', 'teams', 'team_memberships', 'invites', 'workspaces',
    'visualizations', 'visualization_versions', 'visualization_checkpoints',
    'visualization_sources', 'visualization_assets', 'review_requests', 'review_comments',
    'analytics_events', 'leads', 'experiments', 'experiment_variants', 'experiment_exposures',
    'workflow_runs', 'idempotency_records', 'legacy_repository_state'
  ] LOOP
    EXECUTE format('ALTER TABLE intelligent_visualization_supabase.%I ENABLE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('ALTER TABLE intelligent_visualization_supabase.%I FORCE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('REVOKE ALL ON TABLE intelligent_visualization_supabase.%I FROM PUBLIC, anon, authenticated', relation_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE intelligent_visualization_supabase.%I TO iv_runtime', relation_name);
    EXECUTE format('CREATE POLICY iv_runtime_backend ON intelligent_visualization_supabase.%I FOR ALL TO iv_runtime USING (true) WITH CHECK (true)', relation_name);
  END LOOP;
END
$policy$;

ALTER TABLE intelligent_visualization_supabase.schema_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligent_visualization_supabase.schema_migrations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE intelligent_visualization_supabase.schema_migrations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE intelligent_visualization_supabase.schema_migrations TO iv_runtime;
CREATE POLICY iv_runtime_read_lineage ON intelligent_visualization_supabase.schema_migrations FOR SELECT TO iv_runtime USING (true);

INSERT INTO intelligent_visualization_supabase.legacy_repository_state (key, payload, updated_at)
VALUES ('legacy-slides', '{"users":[],"sessions":[],"teams":[],"workspaces":[],"decks":[],"events":[],"leads":[],"invites":[]}'::jsonb, now());
INSERT INTO intelligent_visualization_supabase.schema_migrations (version, name, applied_at)
VALUES (1, 'initial_supabase_private_visualization_schema', now());
