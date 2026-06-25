import { createHash } from "node:crypto"

export function canonicalSerialize(value: unknown): string {
  return JSON.stringify(sortForSerialization(value))
}

export function contentHash(value: unknown): string {
  return createHash("sha256").update(canonicalSerialize(value)).digest("hex")
}

function sortForSerialization(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortForSerialization)
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortForSerialization(nested)]),
    )
  }

  return value
}
