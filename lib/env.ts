import { randomBytes } from "node:crypto"

export function hasFirecrawlEnv() {
  return Boolean(process.env.FIRECRAWL_API_KEY)
}

export function getBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.replace(/^/, "https://") ??
    "http://localhost:3000"
  )
}

export function getSessionCookieName() {
  return "slides_session"
}

export function getSigningSecret() {
  const secret = process.env.VISUALIZATION_SIGNING_SECRET ?? process.env.SLIDES_SIGNING_SECRET
  if (secret) return secret

  if (process.env.NODE_ENV === "production") {
    throw new Error("VISUALIZATION_SIGNING_SECRET is required in production.")
  }

  const development = globalThis as typeof globalThis & { __ivDevelopmentSigningSecret?: string }
  development.__ivDevelopmentSigningSecret ??= randomBytes(32).toString("hex")
  return development.__ivDevelopmentSigningSecret
}

export function getProviderEnvironment() {
  return {
    persistenceProvider: process.env.PERSISTENCE_PROVIDER ?? "local",
    storageProvider: process.env.STORAGE_PROVIDER ?? "auto",
    authProvider: process.env.AUTH_PROVIDER ?? "portable",
    realtimeProvider: process.env.REALTIME_PROVIDER ?? "auto",
    aiEnabled: process.env.AI_ENABLED === "true",
  }
}
