export type ComposerTextInput = {
  entries: string[]
  pending: string
}

export function serializeSourceText(state: ComposerTextInput): string {
  return (state.pending === "" ? state.entries : [...state.entries, state.pending]).join("\n\n")
}

export function restoreSourceText(input: {
  rawText: string
  textEntries?: string[]
  pendingText?: string
}): ComposerTextInput {
  const hasEntries = input.textEntries !== undefined
  const hasPending = input.pendingText !== undefined
  const validEntries = !hasEntries || (Array.isArray(input.textEntries) && Array.from(input.textEntries).every((entry) => typeof entry === "string"))
  const validPending = !hasPending || typeof input.pendingText === "string"
  if ((hasEntries || hasPending) && validEntries && validPending) {
    const state = { entries: [...(input.textEntries ?? [])], pending: input.pendingText ?? "" }
    if (serializeSourceText(state) === input.rawText) return state
  }
  // Legacy text is one source, including all of its original line separators.
  return { entries: input.rawText === "" ? [] : [input.rawText], pending: "" }
}
