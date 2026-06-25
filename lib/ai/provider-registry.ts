import { createGateway } from "@ai-sdk/gateway"
import { anthropic } from "@ai-sdk/anthropic"
import { google } from "@ai-sdk/google"
import { openai } from "@ai-sdk/openai"

export type ProviderKey = "gateway" | "openai" | "anthropic" | "google"
export type ModelRole = "planning" | "generation" | "critique" | "utility" | "vision"

const PROVIDER_MODEL_ENV: Record<ProviderKey, string> = {
  gateway: "AI_GENERATION_MODEL",
  openai: "OPENAI_MODEL",
  anthropic: "ANTHROPIC_MODEL",
  google: "GOOGLE_MODEL",
}

const PROVIDER_KEY_ENV: Record<ProviderKey, string> = {
  gateway: "AI_GATEWAY_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
}

const ROLE_MODEL_ENV: Record<ModelRole, string> = {
  planning: "AI_PLANNING_MODEL",
  generation: "AI_GENERATION_MODEL",
  critique: "AI_CRITIQUE_MODEL",
  utility: "AI_GENERATION_MODEL",
  vision: "AI_VISION_MODEL",
}

function isAiDisabled() {
  return process.env.AI_ENABLED === "false"
}

export function listConfiguredProviders(): ProviderKey[] {
  if (isAiDisabled()) {
    return []
  }

  const providers = (Object.keys(PROVIDER_KEY_ENV) as ProviderKey[]).filter((provider) => {
    if (provider === "gateway") {
      return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL)
    }
    return Boolean(process.env[PROVIDER_KEY_ENV[provider]])
  })

  return providers
}

export function getModelRegistry() {
  return {
    planning: process.env.AI_PLANNING_MODEL ?? process.env.AI_GENERATION_MODEL ?? null,
    generation: process.env.AI_GENERATION_MODEL ?? null,
    critique: process.env.AI_CRITIQUE_MODEL ?? process.env.AI_GENERATION_MODEL ?? null,
    utility: process.env.AI_GENERATION_MODEL ?? null,
    vision: process.env.AI_VISION_MODEL ?? null,
  }
}

export function resolveLanguageModel(
  preferredProvider?: ProviderKey,
  preferredModel?: string,
  role: ModelRole = "generation",
) {
  const available = listConfiguredProviders()
  const provider = preferredProvider && available.includes(preferredProvider)
    ? preferredProvider
    : available[0]

  if (!provider) {
    return null
  }

  const modelName =
    preferredModel ??
    process.env[ROLE_MODEL_ENV[role]] ??
    process.env[PROVIDER_MODEL_ENV[provider]]
  if (!modelName) {
    return null
  }

  switch (provider) {
    case "gateway": {
      const gateway = createGateway({
        apiKey: process.env.AI_GATEWAY_API_KEY,
      })
      return {
        provider,
        modelName,
        model: gateway(modelName),
      }
    }
    case "openai":
      return {
        provider,
        modelName,
        model: openai(modelName),
      }
    case "anthropic":
      return {
        provider,
        modelName,
        model: anthropic(modelName),
      }
    case "google":
      return {
        provider,
        modelName,
        model: google(modelName),
      }
    default:
      return null
  }
}
