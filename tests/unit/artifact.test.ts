import { describe, expect, it } from "vitest"

import { compileVisualizationArtifact } from "@/lib/artifacts/compiler"
import { createStarterCourseDocument, createStarterReportDocument, createStarterSlidesDocument } from "@/packages/domain/fixtures"

describe("compileVisualizationArtifact", () => {
  it.each([
    ["course", createStarterCourseDocument()],
    ["slides", createStarterSlidesDocument()],
    ["report", createStarterReportDocument()],
  ] as const)("compiles a standalone %s artifact", async (kind, document) => {
    const compiled = await compileVisualizationArtifact(document, {
      visualizationId: `viz-${kind}`,
      versionId: `ver-${kind}`,
      createdAt: "2026-06-25T00:00:00.000Z",
    })

    expect(compiled.html).toContain("<!doctype html>")
    expect(compiled.html).not.toContain("https://cdn")
    expect(compiled.manifest.kind).toBe(kind)
    expect(compiled.manifest.artifactHash).toBe(compiled.contentHash)
  })

  it("escapes unsafe content", async () => {
    const document = createStarterSlidesDocument()
    document.title = `<img src=x onerror=alert(1)>`
    const compiled = await compileVisualizationArtifact(document, {
      visualizationId: "viz",
      versionId: "version",
    })
    expect(compiled.html).toContain("&lt;img")
    expect(compiled.html).not.toContain("<img src=x")
  })
})
