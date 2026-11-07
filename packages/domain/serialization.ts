import { createHash } from "node:crypto"
import { canonicalSerialize } from "./canonical"
export { canonicalSerialize } from "./canonical"

export function contentHash(value: unknown): string {
  return createHash("sha256").update(canonicalSerialize(value)).digest("hex")
}
