import { describe, expect, it, vi } from "vitest"

import { localConnectionString } from "@/packages/provider-local/database"
import { resolvePersistenceKind } from "@/lib/persistence/factory"
import { resolveStorageKind } from "@/lib/storage/factory"

describe("PostgreSQL configuration", () => {
  it("requires an explicit local URL without a hosted or file fallback", () => {
    vi.stubEnv("LOCAL_DATABASE_URL", "")
    vi.stubEnv("DATABASE_URL", "postgresql://user:password@hosted.example/remote")
    try { expect(() => localConnectionString()).toThrow(/required/) } finally { vi.unstubAllEnvs() }
  })

  it("rejects an explicitly empty URL even when the environment is configured", () => {
    vi.stubEnv("LOCAL_DATABASE_URL", "postgresql://user:password@127.0.0.1/local")
    try { expect(() => localConnectionString("")).toThrow(/required/) } finally { vi.unstubAllEnvs() }
  })

  it("accepts explicit PostgreSQL loopback URLs including IPv6", () => {
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
      const value = `postgresql://user:password@${host}:54431/local`
      expect(localConnectionString(value)).toBe(value)
    }
  })

  it("rejects file protocols and remote database targets", () => {
    for (const value of ["file:old.db", "mysql://localhost/db", "postgresql://hosted.example/db", "postgresql://127.0.0.1/"]) {
      expect(() => localConnectionString(value)).toThrow()
    }
  })

  it("rejects URL connection overrides that could escape the local target", () => {
    for (const query of ["host=remote.example", "options=-c%20search_path=public", "sslcert=/private/file"]) {
      expect(() => localConnectionString(`postgresql://user@127.0.0.1/local?${query}`)).toThrow()
    }
  })

  it("limits persistence selection to local and the explicit Supabase boundary", () => {
    expect(resolvePersistenceKind("local")).toBe("local")
    expect(resolvePersistenceKind("supabase")).toBe("supabase")
    for (const value of ["unknown", "file", "remote"]) expect(() => resolvePersistenceKind(value)).toThrow()
  })

  it("validates storage selection without silently selecting a different provider", () => {
    expect(resolveStorageKind("local", "auto")).toBe("local")
    expect(resolveStorageKind("supabase", "auto")).toBe("supabase")
    expect(resolveStorageKind("local", "vercel-blob")).toBe("vercel-blob")
    expect(() => resolveStorageKind("local", "unrecognized")).toThrow()
    expect(() => resolveStorageKind("unrecognized", "auto")).toThrow()
  })
})
