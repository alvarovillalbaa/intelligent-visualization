import "./load-local-env"

import { promises as fs } from "node:fs"

import { hashSecret } from "@/lib/auth"
import { compileVisualizationArtifact } from "@/lib/artifacts/compiler"
import { createDomainId, createPublicId } from "@/packages/domain/ids"
import {
  createStarterCourseDocument,
  createStarterReportDocument,
  createStarterSlidesDocument,
} from "@/packages/domain/fixtures"
import { createLocalPersistenceProvider } from "@/packages/provider-local/adapter"
import { getLocalDatabase, initializeLocalDatabase, upgradeLocalLifecycle } from "@/packages/provider-local/database"
import { seedLegacyRepository } from "@/packages/provider-local/legacy-state"
import { LocalStorageAdapter } from "@/packages/storage/local"
import type { VisualizationDocument, VisualizationKind } from "@/packages/domain/entities"

const storageDir = process.env.LOCAL_STORAGE_DIR ?? ".data/storage"
const seedVersionIds: Record<VisualizationKind, string> = {
  course: "019efefe-0000-7000-8000-000000000001",
  slides: "019efefe-0000-7000-8000-000000000002",
  report: "019efefe-0000-7000-8000-000000000003",
}

async function main() {
  if ((process.env.PERSISTENCE_PROVIDER ?? "local") !== "local"
    || !["auto", "local"].includes(process.env.STORAGE_PROVIDER ?? "auto")) {
    throw new Error("Local setup requires local persistence and storage.")
  }
  const provider = createLocalPersistenceProvider()
  const database = getLocalDatabase()
  try {
    if (process.argv.includes("--upgrade-lifecycle-v2")) {
      await upgradeLocalLifecycle(database, process.argv.includes("--acknowledge-stopped-v1-processes"))
    }
    await initializeLocalDatabase(database)
    await seedLegacyRepository(database)
    await fs.mkdir(storageDir, { recursive: true })
    const storage = new LocalStorageAdapter(storageDir)
    await provider.health()
    await storage.health()

    const registration = await provider.commands.registerUserWithTeam({
      idempotencyKey: "seed:demo-user",
      name: "Morgan Lee",
      email: "morgan@northstarlabs.com",
      passwordHash: hashSecret("demo1234"),
      teamName: "Northstar Labs",
    })

    const documents: Array<{ kind: VisualizationKind; slug: string; title: string; document: VisualizationDocument }> = [
      { kind: "course", slug: "starter-course", title: "Starter Course", document: createStarterCourseDocument() },
      { kind: "slides", slug: "starter-slides", title: "Starter Slides", document: createStarterSlidesDocument() },
      { kind: "report", slug: "starter-report", title: "Starter Report", document: createStarterReportDocument() },
    ]

    for (const item of documents) {
      const createdVisualization = await provider.visualizations.create({
        idempotencyKey: `seed:${item.kind}:create`,
        teamId: registration.team.id,
        workspaceId: registration.workspace.id,
        publicId: createPublicId(item.kind),
        kind: item.kind,
        slug: item.slug,
        title: item.title,
        description: item.document.summary,
        document: item.document,
        createdBy: registration.user.id,
      })

      const visualization = (await provider.visualizations.get(createdVisualization.id)) ?? createdVisualization
      if (visualization.publishedVersionId) {
        continue
      }

      const versionId = seedVersionIds[item.kind] ?? createDomainId()
      const compiled = await compileVisualizationArtifact(visualization.draftDocument, {
        visualizationId: visualization.id,
        versionId,
      })
      const object = await storage.put({
        key: `published/${visualization.publicId}/${versionId}/index.html`,
        body: compiled.html,
        contentType: "text/html; charset=utf-8",
        immutable: true,
      })
      await storage.put({
        key: `published/${visualization.publicId}/${versionId}/manifest.json`,
        body: JSON.stringify(compiled.manifest, null, 2),
        contentType: "application/json",
        immutable: true,
      })
      await provider.commands.publishVisualizationVersion({
        idempotencyKey: `seed:${item.kind}:publish`,
        visualizationId: visualization.id,
        expectedRevision: visualization.draftRevision,
        versionId,
        label: "Seeded published version",
        artifactStorageKey: object.key,
        artifactUrl: `/published/${visualization.publicId}/${versionId}`,
        artifactHash: compiled.contentHash,
        manifest: compiled.manifest,
        createdBy: registration.user.id,
      })
    }

    const health = await provider.health()
    console.log(
      JSON.stringify(
        {
          ok: health.ok,
          persistence: "local-postgresql",
          seeded: ["canonical", "legacy"],
          visualizationKinds: documents.map((item) => item.kind),
        },
        null,
        2,
      ),
    )
  } finally {
    try { await provider.close() } finally { await database.close() }
  }
}

main().catch(() => {
  console.error("Local setup failed. Check LOCAL_DATABASE_URL and local PostgreSQL availability; existing data was not reset.")
  process.exitCode = 1
})
