import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { compileVisualizationArtifact } from "@/lib/artifacts/compiler"
import { createStarterSlidesDocument } from "@/packages/domain/fixtures"
import { createDomainId, createPublicId } from "@/packages/domain/ids"
import { createLocalPersistenceProvider } from "@/packages/provider-local/adapter"

async function createProvider() {
  const root = await mkdtemp(path.join(os.tmpdir(), "iv-local-provider-"))
  const provider = createLocalPersistenceProvider({ databasePath: path.join(root, "db.sqlite") })
  await provider.health()
  return provider
}

describe("local persistence provider contract slice", () => {
  it("registers a user with a team idempotently", async () => {
    const provider = await createProvider()
    const command = {
      idempotencyKey: "register-demo",
      name: "Morgan",
      email: "morgan@example.com",
      passwordHash: "hash",
      teamName: "Northstar",
    }

    const first = await provider.commands.registerUserWithTeam(command)
    const second = await provider.commands.registerUserWithTeam(command)

    expect(first.status).toBe("created")
    expect(second.user.id).toBe(first.user.id)
    expect(await provider.users.findByEmail("morgan@example.com")).toMatchObject({ id: first.user.id })
  })

  it("creates visualizations, rejects stale revisions, and publishes atomically", async () => {
    const provider = await createProvider()
    const registration = await provider.commands.registerUserWithTeam({
      idempotencyKey: "register",
      name: "Morgan",
      email: "morgan@example.com",
      passwordHash: "hash",
      teamName: "Northstar",
    })
    const document = createStarterSlidesDocument()
    const visualization = await provider.visualizations.create({
      idempotencyKey: "create-viz",
      teamId: registration.team.id,
      workspaceId: registration.workspace.id,
      publicId: createPublicId("slides"),
      kind: "slides",
      slug: "demo",
      title: document.title,
      description: document.summary,
      document,
      createdBy: registration.user.id,
    })

    const saved = await provider.commands.saveVisualizationRevision({
      idempotencyKey: "save-viz",
      visualizationId: visualization.id,
      expectedRevision: visualization.draftRevision,
      document: { ...document, title: "Updated" },
    })
    expect(saved.status).toBe("saved")
    if (saved.status !== "saved") throw new Error("Expected saved result")

    const conflict = await provider.commands.saveVisualizationRevision({
      idempotencyKey: "stale-save",
      visualizationId: visualization.id,
      expectedRevision: visualization.draftRevision,
      document,
    })
    expect(conflict.status).toBe("conflict")

    const versionId = createDomainId()
    const compiled = await compileVisualizationArtifact(saved.visualization.draftDocument, {
      visualizationId: saved.visualization.id,
      versionId,
    })
    const published = await provider.commands.publishVisualizationVersion({
      idempotencyKey: "publish-viz",
      visualizationId: saved.visualization.id,
      expectedRevision: saved.visualization.draftRevision,
      versionId,
      label: "Published",
      artifactStorageKey: "published/demo/index.html",
      artifactUrl: "/published/demo",
      artifactHash: compiled.contentHash,
      manifest: compiled.manifest,
      createdBy: registration.user.id,
    })

    expect(published.status).toBe("published")
    if (published.status !== "published") throw new Error("Expected published result")
    expect(published.visualization.publishedVersionId).toBe(versionId)
    expect((await provider.versions.listByVisualization(visualization.id))).toHaveLength(1)
  })

  it("records analytics, leads, reviews, and sticky experiment exposures", async () => {
    const provider = await createProvider()
    const registration = await provider.commands.registerUserWithTeam({
      idempotencyKey: "register",
      name: "Morgan",
      email: "morgan@example.com",
      passwordHash: "hash",
      teamName: "Northstar",
    })
    const document = createStarterSlidesDocument()
    const visualization = await provider.visualizations.create({
      idempotencyKey: "create-viz",
      teamId: registration.team.id,
      workspaceId: registration.workspace.id,
      publicId: createPublicId("slides"),
      kind: "slides",
      slug: "demo",
      title: document.title,
      description: document.summary,
      document,
      createdBy: registration.user.id,
    })

    await provider.analytics.recordBatch([
      {
        id: createDomainId(),
        visualizationId: visualization.id,
        publicId: visualization.publicId,
        versionId: null,
        type: "view",
        nodeId: null,
        nodeKind: null,
        visitorId: "visitor-1",
        value: null,
        durationMs: null,
        createdAt: new Date().toISOString(),
      },
    ])
    expect(await provider.analytics.listByVisualization(visualization.id)).toHaveLength(1)

    await provider.leads.create({
      id: createDomainId(),
      visualizationId: visualization.id,
      publicId: visualization.publicId,
      versionId: null,
      visitorId: "visitor-1",
      fields: { email: "lead@example.com" },
      createdAt: new Date().toISOString(),
    })
    expect(await provider.leads.listByVisualization(visualization.id)).toHaveLength(1)

    const versionA = createDomainId()
    const versionB = createDomainId()
    await provider.experiments.create(
      {
        id: "experiment-1",
        visualizationId: visualization.id,
        name: "Test",
        question: "Which version works?",
        status: "draft",
        fallbackVersionId: versionA,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      [
        { id: "variant-a", experimentId: "experiment-1", label: "A", versionId: versionA, weight: 50 },
        { id: "variant-b", experimentId: "experiment-1", label: "B", versionId: versionB, weight: 50 },
      ],
    )
    await provider.commands.activateExperiment({ idempotencyKey: "activate", experimentId: "experiment-1" })
    const first = await provider.commands.recordExperimentExposure({
      idempotencyKey: "exposure-1",
      experimentId: "experiment-1",
      visitorId: "visitor-1",
    })
    const second = await provider.commands.recordExperimentExposure({
      idempotencyKey: "exposure-2",
      experimentId: "experiment-1",
      visitorId: "visitor-1",
    })
    expect(second).toEqual(first)
  })
})
