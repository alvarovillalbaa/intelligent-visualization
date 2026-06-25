import { promises as fs } from "node:fs"
import path from "node:path"

import { hashSecret } from "@/lib/auth"
import { compileVisualizationArtifact } from "@/lib/artifacts/compiler"
import { createDomainId, createPublicId } from "@/packages/domain/ids"
import {
  createStarterCourseDocument,
  createStarterReportDocument,
  createStarterSlidesDocument,
} from "@/packages/domain/fixtures"
import { createLocalPersistenceProvider } from "@/packages/provider-local/adapter"
import { LocalStorageAdapter } from "@/packages/storage/local"
import type { VisualizationDocument, VisualizationKind } from "@/packages/domain/entities"

const databasePath = process.env.LOCAL_DATABASE_PATH ?? ".data/intelligent-visualization.sqlite"
const storageDir = process.env.LOCAL_STORAGE_DIR ?? ".data/storage"
const seedVersionIds: Record<VisualizationKind, string> = {
  course: "019efefe-0000-7000-8000-000000000001",
  slides: "019efefe-0000-7000-8000-000000000002",
  report: "019efefe-0000-7000-8000-000000000003",
}

async function main() {
  await fs.mkdir(path.dirname(databasePath), { recursive: true })
  await fs.mkdir(storageDir, { recursive: true })

  const provider = createLocalPersistenceProvider({ databasePath })
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
        databasePath,
        storageDir,
        demoUser: "morgan@northstarlabs.com",
        demoPassword: "demo1234",
        teamId: registration.team.id,
        workspaceId: registration.workspace.id,
      },
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
