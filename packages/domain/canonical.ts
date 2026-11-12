export function canonicalSerialize(value: unknown): string {
  return JSON.stringify(sortForSerialization(value))
}

function sortForSerialization(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForSerialization)
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sortForSerialization(nested)]))
  }
  return value
}
