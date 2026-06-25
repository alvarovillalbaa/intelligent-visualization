import { NextResponse } from "next/server"

import { getPersistenceProvider, resolvePersistenceKind } from "@/lib/persistence/factory"
import { resolveStorageKind } from "@/lib/storage/factory"

export async function GET() {
  const persistenceKind = resolvePersistenceKind()
  const storageKind = resolveStorageKind(persistenceKind)

  try {
    const provider = await getPersistenceProvider()
    const health = await provider.health()
    return NextResponse.json({
      persistenceProvider: provider.kind,
      storageProvider: storageKind,
      realtimeProvider: process.env.REALTIME_PROVIDER ?? "auto",
      authProvider: process.env.AUTH_PROVIDER ?? "portable",
      aiEnabled: process.env.AI_ENABLED === "true",
      workflowsEnabled: process.env.WORKFLOWS_ENABLED !== "false",
      eveEnabled: process.env.EVE_ENABLED === "true",
      capabilities: provider.capabilities,
      health,
    })
  } catch (error) {
    return NextResponse.json(
      {
        persistenceProvider: persistenceKind,
        storageProvider: storageKind,
        health: {
          ok: false,
          message: error instanceof Error ? error.message : "Unknown provider error.",
          checkedAt: new Date().toISOString(),
        },
      },
      { status: 503 },
    )
  }
}
