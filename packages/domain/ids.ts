import { v7 as uuidv7, validate as validateUuid } from "uuid"

export type DomainId = string

export function createDomainId(): DomainId {
  return uuidv7()
}

export function isDomainId(value: string): boolean {
  return validateUuid(value)
}

export function createPublicId(prefix = "viz"): string {
  return `${prefix}_${uuidv7().replaceAll("-", "")}`
}
