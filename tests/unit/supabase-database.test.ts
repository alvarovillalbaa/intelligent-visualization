import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { supabaseConnectionString } from "@/packages/provider-supabase/database"

const project = "abcdefghijklmnopqrst"
const direct = `postgresql://iv_runtime:authored-ci-only@db.${project}.supabase.co:5432/postgres`
const pooled = `postgresql://iv_runtime.${project}:authored-ci-only@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`

beforeEach(() => {
  vi.stubEnv("SUPABASE_DATABASE_URL", "")
  vi.stubEnv("NODE_TLS_REJECT_UNAUTHORIZED", "")
  vi.stubEnv("PGOPTIONS", "")
})
afterEach(() => { vi.unstubAllEnvs() })

describe("Supabase database connection trust policy", () => {
  it("requires the dedicated Supabase URL without local or generic database fallback", () => {
    vi.stubEnv("LOCAL_DATABASE_URL", direct)
    vi.stubEnv("DATABASE_URL", pooled)
    expect(() => supabaseConnectionString()).toThrow(/SUPABASE_DATABASE_URL/)
    vi.stubEnv("SUPABASE_DATABASE_URL", direct)
    expect(supabaseConnectionString()).toBe(direct)
    expect(() => supabaseConnectionString("")).toThrow(/SUPABASE_DATABASE_URL/)
  })

  it("accepts canonical direct Supabase runtime URLs while preserving encoded credentials", () => {
    for (const protocol of ["postgres", "postgresql"]) {
      const value = `${protocol}://iv_runtime:authored%3Aci%40only@db.${project}.supabase.co:5432/postgres`
      expect(supabaseConnectionString(value)).toBe(value)
    }
  })

  it("accepts canonical transaction pooler URLs with a project scoped runtime role", () => {
    expect(supabaseConnectionString(pooled)).toBe(pooled)
    const value = pooled.replace("aws-0-eu-west-1", "aws-1-us-east-1")
    expect(supabaseConnectionString(value)).toBe(value)
  })

  it("rejects loopback external and suffix lookalike database hosts", () => {
    for (const host of ["127.0.0.1", "localhost", "[::1]", "database.example.invalid",
      `db.${project}.supabase.co.attacker.invalid`, `db.${project}.supabase.com`,
      "aws-0-eu-west-1.pooler.supabase.com.attacker.invalid"]) {
      expect(() => supabaseConnectionString(direct.replace(`db.${project}.supabase.co`, host))).toThrow()
    }
    expect(() => supabaseConnectionString(pooled.replace("aws-0-eu-west-1", "eu-west-1"))).toThrow()
  })

  it("rejects owner browser and malformed project roles on direct and pooled targets", () => {
    for (const role of ["postgres", "service_role", "anon", "authenticated", `iv_runtime.${project}`, "iv%5Fruntime"]) {
      expect(() => supabaseConnectionString(direct.replace("iv_runtime:", `${role}:`))).toThrow()
    }
    for (const role of ["postgres", "iv_runtime", "iv_runtime.short", "iv_runtime.ABCDEFGHIJKLMNOPQRST"]) {
      expect(() => supabaseConnectionString(pooled.replace(`iv_runtime.${project}:`, `${role}:`))).toThrow()
    }
  })

  it("rejects unsupported protocols and noncanonical database paths", () => {
    for (const value of ["file:database.db", "mysql://iv_runtime:authored-ci-only@localhost/postgres",
      direct.replace("postgresql:", "https:"), direct.replace("/postgres", "/application"),
      direct.replace("/postgres", "/"), direct.replace("/postgres", "/postgres/"),
      direct.replace("/postgres", "/%70ostgres")]) {
      expect(() => supabaseConnectionString(value)).toThrow()
    }
  })

  it("rejects missing passwords malformed escapes and encoded NUL credentials", () => {
    for (const password of ["", "%", "%ZZ", "authored%00ci-only"]) {
      expect(() => supabaseConnectionString(direct.replace("authored-ci-only", password))).toThrow()
    }
    expect(() => supabaseConnectionString(direct.replace(":authored-ci-only", ""))).toThrow()
  })

  it("rejects absent swapped and unexpected endpoint ports", () => {
    for (const value of [direct.replace(":5432", ""), direct.replace(":5432", ":6543"),
      direct.replace(":5432", ":443"), pooled.replace(":6543", ""),
      pooled.replace(":6543", ":5432"), pooled.replace(":6543", ":6544")]) {
      expect(() => supabaseConnectionString(value)).toThrow()
    }
  })

  it("rejects all URL overrides and fragments including permissive SSL modes", () => {
    for (const suffix of ["?sslmode=disable", "?sslmode=require", "?sslmode=verify-full",
      "?host=127.0.0.1", "?options=-c%20role%3Dpostgres", "?sslcert=%2Fprivate%2Fkey",
      "?application_name=override", "#authored-fragment"]) {
      expect(() => supabaseConnectionString(direct + suffix)).toThrow()
      expect(() => supabaseConnectionString(pooled + suffix)).toThrow()
    }
  })

  it("rejects process wide TLS certificate verification disabling", () => {
    vi.stubEnv("NODE_TLS_REJECT_UNAUTHORIZED", "0")
    expect(() => supabaseConnectionString(direct)).toThrow()
    expect(() => supabaseConnectionString(pooled)).toThrow()
  })

  it("rejects PostgreSQL startup options inherited from the environment", () => {
    for (const options of ["-c role=postgres", "-c search_path=public", " "]) {
      vi.stubEnv("PGOPTIONS", options)
      expect(() => supabaseConnectionString(direct)).toThrow()
      expect(() => supabaseConnectionString(pooled)).toThrow()
    }
  })

  it("returns a credential free policy error for rejected connection strings", () => {
    const password = "authored-secret-never-report"
    const value = direct.replace("authored-ci-only", password) + "?sslmode=disable"
    try {
      supabaseConnectionString(value)
      throw new Error("An unsafe URL was accepted")
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      const message = (error as Error).message
      expect(message).toContain("SUPABASE_DATABASE_URL")
      expect(message).not.toContain(password)
      expect(message).not.toContain(value)
    }
  })
})
