import { describe, expect, it } from "vitest"

import { createLocalPersistenceProvider } from "@/packages/provider-local/adapter"
import { initializeLocalDatabase } from "@/packages/provider-local/database"
import { LOCAL_SCHEMA } from "@/packages/provider-local/schema"
import { createDomainId, createPublicId } from "@/packages/domain/ids"
import { createStarterSlidesDocument } from "@/packages/domain/fixtures"
import { compileVisualizationArtifact } from "@/lib/artifacts/compiler"
import { withPostgresFixture, type createPostgresFixture } from "./postgres-fixture"

type Fixture = Awaited<ReturnType<typeof createPostgresFixture>>
async function createVisualization(fixture: Fixture) {
  const registration = await fixture.provider.commands.registerUserWithTeam({ idempotencyKey: "register",
    name: "Authored person", email: "authored@example.com", passwordHash: "authored-hash", teamName: "Authored team" })
  const document = createStarterSlidesDocument()
  const visualization = await fixture.provider.visualizations.create({ idempotencyKey: "create",
    teamId: registration.team.id, workspaceId: registration.workspace.id, publicId: createPublicId("slides"),
    kind: "slides", slug: "authored-slides", title: document.title, description: document.summary,
    document, createdBy: registration.user.id })
  return { registration, visualization }
}
async function publish(fixture: Fixture, visualization: Awaited<ReturnType<typeof createVisualization>>["visualization"], userId: string, key = "publish") {
  const versionId = createDomainId()
  const artifact = await compileVisualizationArtifact(visualization.draftDocument, { visualizationId: visualization.id, versionId })
  return fixture.provider.commands.publishVisualizationVersion({ idempotencyKey: key,
    visualizationId: visualization.id, expectedRevision: visualization.draftRevision, versionId,
    label: "Authored publication", artifactStorageKey: `published/${versionId}/index.html`,
    artifactUrl: `/published/${visualization.publicId}/${versionId}`, artifactHash: artifact.contentHash,
    manifest: artifact.manifest, createdBy: userId })
}

describe("PostgreSQL persistence invariants", () => {
  it("commits one registration for concurrent retries of the same idempotency key", async () => withPostgresFixture(async ({ provider, database }) => {
    const command = { idempotencyKey: "parallel-register", name: "Authored person", email: "parallel@example.com", passwordHash: "hash", teamName: "Parallel team" }
    const results = await Promise.all(Array.from({ length: 4 }, () => provider.commands.registerUserWithTeam(command)))
    expect(new Set(results.map((result) => result.user.id)).size).toBe(1)
    for (const table of ["users", "teams", "workspaces", "team_memberships", "idempotency_records"]) {
      expect((await database.query(`SELECT count(*)::int AS count FROM ${LOCAL_SCHEMA}.${table}`)).rows[0].count).toBe(1)
    }
  }))

  it("serializes normalized email registration across different request keys", async () => withPostgresFixture(async ({ provider, database }) => {
    const base = { name: "Authored person", passwordHash: "hash", teamName: "Email team" }
    const results = await Promise.all([
      provider.commands.registerUserWithTeam({ ...base, idempotencyKey: "email-a", email: "Email@Example.com" }),
      provider.commands.registerUserWithTeam({ ...base, idempotencyKey: "email-b", email: "email@example.com" }),
    ])
    expect(results[0].user.id).toBe(results[1].user.id)
    expect((await database.query(`SELECT count(*)::int AS count FROM ${LOCAL_SCHEMA}.users`)).rows[0].count).toBe(1)
    await expect(provider.visualizations.create({ idempotencyKey: "email-a" } as never)).rejects.toThrow(/another command/)
  }))

  it("allows only one concurrent save against the same expected revision", async () => withPostgresFixture(async (fixture) => {
    const { visualization } = await createVisualization(fixture)
    const results = await Promise.all(["A", "B"].map((title) => fixture.provider.commands.saveVisualizationRevision({
      idempotencyKey: `save-${title}`, visualizationId: visualization.id, expectedRevision: visualization.draftRevision,
      document: { ...visualization.draftDocument, title },
    })))
    expect(results.map((result) => result.status).sort()).toEqual(["conflict", "saved"])
    expect((await fixture.provider.visualizations.get(visualization.id))?.draftRevision).toBe(2)
  }))

  it("rolls back version and idempotency writes when publication fails after its insert", async () => withPostgresFixture(async (fixture) => {
    const { visualization, registration } = await createVisualization(fixture)
    await fixture.database.query(`CREATE FUNCTION ${LOCAL_SCHEMA}.reject_publish() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'authored publication rejection'; END; $$`)
    await fixture.database.query(`CREATE TRIGGER reject_publish BEFORE UPDATE ON ${LOCAL_SCHEMA}.visualizations FOR EACH ROW WHEN (NEW.status = 'published') EXECUTE FUNCTION ${LOCAL_SCHEMA}.reject_publish()`)
    try {
      await expect(publish(fixture, visualization, registration.user.id)).rejects.toThrow(/authored publication rejection/)
      expect(await fixture.provider.versions.listByVisualization(visualization.id)).toEqual([])
      expect((await fixture.provider.visualizations.get(visualization.id))?.publishedVersionId).toBeNull()
      expect((await fixture.database.query(`SELECT count(*)::int AS count FROM ${LOCAL_SCHEMA}.idempotency_records WHERE key=$1`, ["publish"])).rows[0].count).toBe(0)
    } finally {
      await fixture.database.query(`DROP TRIGGER reject_publish ON ${LOCAL_SCHEMA}.visualizations`)
      await fixture.database.query(`DROP FUNCTION ${LOCAL_SCHEMA}.reject_publish()`)
    }
    expect((await publish(fixture, visualization, registration.user.id)).status).toBe("published")
  }))

  it("round-trips native JSONB scalar patches, ISO timestamps and literal SQL-looking content", async () => withPostgresFixture(async (fixture) => {
    const { visualization, registration } = await createVisualization(fixture)
    const result = await publish(fixture, visualization, registration.user.id)
    if (result.status !== "published") throw new Error("Expected actual publication")
    const requestId = createDomainId()
    await fixture.provider.reviews.createRequest({ id: requestId, visualizationId: visualization.id, versionId: result.version.id,
      tokenHash: "authored-token-hash", title: "Authored review", status: "open", createdAt: new Date().toISOString() })
    for (const [index, patch] of [false, 0, "O'Reilly ?; DROP TABLE users;"].entries()) {
      const body = `Authored literal ${index}: O'Reilly ?; --`
      await fixture.provider.reviews.appendComment({ idempotencyKey: `review-${index}`, reviewRequestId: requestId,
        authorName: "Authored reviewer", body, anchor: { nodeKind: "slide", nodeId: "authored-node" }, suggestedPatch: patch })
    }
    const comments = await fixture.provider.reviews.listComments(requestId)
    expect(comments.map((comment) => comment.suggestedPatch)).toEqual([false, 0, "O'Reilly ?; DROP TABLE users;"])
    expect(comments[0].createdAt).toMatch(/^\d{4}-\d\d-\d\dT.*Z$/)
    const types = (await fixture.database.query(`SELECT pg_typeof(draft_document_json)::text AS json_type, pg_typeof(created_at)::text AS time_type FROM ${LOCAL_SCHEMA}.visualizations WHERE id=$1`, [visualization.id])).rows[0]
    expect(types).toEqual({ json_type: "jsonb", time_type: "timestamp with time zone" })
    expect(await fixture.provider.users.get(registration.user.id)).not.toBeNull()
  }))

  it("retains committed state after closing and reopening the provider pool", async () => withPostgresFixture(async (fixture) => {
    const { visualization } = await createVisualization(fixture)
    await fixture.provider.close()
    const reopened = createLocalPersistenceProvider({ connectionString: fixture.connectionString })
    try { expect(await reopened.visualizations.get(visualization.id)).toEqual(visualization) } finally { await reopened.close() }
  }))

  it("keeps a failed command retryable without a partial idempotency record", async () => withPostgresFixture(async (fixture) => {
    const document = createStarterSlidesDocument()
    const base = { idempotencyKey: "retry-create", teamId: "missing-team", workspaceId: "missing-workspace",
      publicId: createPublicId("slides"), kind: "slides" as const, slug: "retry", title: document.title,
      description: document.summary, document, createdBy: "authored-user" }
    await expect(fixture.provider.visualizations.create(base)).rejects.toThrow()
    expect((await fixture.database.query(`SELECT count(*)::int AS count FROM ${LOCAL_SCHEMA}.idempotency_records WHERE key=$1`, [base.idempotencyKey])).rows[0].count).toBe(0)
    const { registration } = await createVisualization(fixture)
    expect((await fixture.provider.visualizations.create({ ...base, teamId: registration.team.id,
      workspaceId: registration.workspace.id, createdBy: registration.user.id })).slug).toBe("retry")
  }))

  it("rejects unknown schema versions and permits initialization retry after correction", async () => withPostgresFixture(async ({ database }) => {
    await database.query(`INSERT INTO ${LOCAL_SCHEMA}.schema_migrations VALUES ($1,$2,$3)`, [99, "authored-future", new Date().toISOString()])
    await expect(initializeLocalDatabase(database)).rejects.toThrow(/unknown migration/)
    await database.query(`DELETE FROM ${LOCAL_SCHEMA}.schema_migrations WHERE version=$1`, [99])
    await expect(initializeLocalDatabase(database)).resolves.toBeUndefined()
  }))

  it("refuses to adopt existing unversioned tables", async () => withPostgresFixture(async ({ database }) => {
    await database.query(`DROP TABLE ${LOCAL_SCHEMA}.schema_migrations`)
    await expect(initializeLocalDatabase(database)).rejects.toThrow(/unversioned/)
    expect((await database.query("SELECT to_regclass($1) AS relation", [`${LOCAL_SCHEMA}.schema_migrations`])).rows[0].relation).toBeNull()
  }))

  it("rolls back a nested transaction while allowing its outer transaction to commit", async () => withPostgresFixture(async ({ database }) => {
    const insert = `INSERT INTO ${LOCAL_SCHEMA}.workflow_runs (id,kind,status,input_json,created_at,updated_at) VALUES ($1,'authored','complete','{}'::jsonb,$2,$2)`
    await database.transaction(async (outer) => {
      await outer.query(insert, ["outer", new Date().toISOString()])
      await expect(outer.transaction(async (inner) => {
        await inner.query(insert, ["inner", new Date().toISOString()])
        throw new Error("Authored nested rollback")
      })).rejects.toThrow(/nested rollback/)
    })
    expect((await database.query(`SELECT id FROM ${LOCAL_SCHEMA}.workflow_runs ORDER BY id`)).rows.map((row) => row.id)).toEqual(["outer"])
  }))

  it("keeps unrelated public-schema data outside provider initialization and writes", async () => withPostgresFixture(async (fixture) => {
    await fixture.database.query("CREATE TABLE public.users (id TEXT PRIMARY KEY, note TEXT NOT NULL)")
    await fixture.database.query("INSERT INTO public.users VALUES ($1,$2)", ["sentinel", "Retain unrelated public data"])
    await createVisualization(fixture)
    expect((await fixture.database.query("SELECT * FROM public.users")).rows).toEqual([{ id: "sentinel", note: "Retain unrelated public data" }])
  }))
})
