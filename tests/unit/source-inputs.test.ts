import { describe, expect, it } from "vitest"

import {
  restoreSourceText,
  serializeSourceText,
  type ComposerTextInput,
} from "@/lib/client/composer-source-input"
import { loadGuestDraft, storeGuestDraft } from "@/lib/client/guest-draft"

describe("source text preservation", () => {
  it("restores multiline legacy content as one entry without changing CRLF or spacing", () => {
    const rawText = "  First paragraph\r\nSecond line\r\n\r\n  Last paragraph  \n"
    const restored = restoreSourceText({ rawText })
    expect(restored).toEqual({ entries: [rawText], pending: "" })
    expect(serializeSourceText(restored)).toBe(rawText)
  })

  it("preserves every entry's whitespace, line endings, order, and duplicates", () => {
    const state = { entries: ["  first\r\nline  ", "\n\tsecond\n", "  first\r\nline  "], pending: "" }
    const rawText = serializeSourceText(state)
    expect(rawText).toBe("  first\r\nline  \n\n\n\tsecond\n\n\n  first\r\nline  ")
    expect(restoreSourceText({ rawText, textEntries: state.entries, pendingText: state.pending })).toEqual(state)
  })

  it("includes unsent pending input with its exact multiline and trailing whitespace", () => {
    const state = { entries: ["committed\nsource"], pending: " \r\n pending source  \n" }
    const rawText = serializeSourceText(state)
    expect(rawText).toBe("committed\nsource\n\n \r\n pending source  \n")
    expect(restoreSourceText({ rawText, textEntries: state.entries, pendingText: state.pending })).toEqual(state)
  })

  it("preserves whitespace-only entries and pending instead of treating them as empty", () => {
    const state = { entries: ["", " \t", "\n"], pending: "  \r\n" }
    const rawText = serializeSourceText(state)
    expect(rawText).toBe("\n\n \t\n\n\n\n\n  \r\n")
    expect(restoreSourceText({ rawText, textEntries: state.entries, pendingText: state.pending })).toEqual(state)
  })

  it("does not add a delimiter for empty pending input", () => {
    expect(serializeSourceText({ entries: ["a", "b\n"], pending: "" })).toBe("a\n\nb\n")
    expect(serializeSourceText({ entries: [], pending: "" })).toBe("")
    expect(restoreSourceText({ rawText: "" })).toEqual({ entries: [], pending: "" })
  })

  it("accepts exact optional metadata, including entries-only and pending-only drafts", () => {
    expect(restoreSourceText({ rawText: "a\n\nb", textEntries: ["a", "b"] })).toEqual({ entries: ["a", "b"], pending: "" })
    expect(restoreSourceText({ rawText: "  pending\r\n", pendingText: "  pending\r\n" })).toEqual({ entries: [], pending: "  pending\r\n" })
    expect(restoreSourceText({ rawText: "a", textEntries: ["a"], pendingText: undefined })).toEqual({ entries: ["a"], pending: "" })
  })

  it("ignores valid but mismatched metadata and preserves canonical rawText as one source", () => {
    const rawText = "same\r\n\r\nsame  "
    for (const metadata of [
      { textEntries: ["same", "same"], pendingText: "" },
      { textEntries: [rawText], pendingText: "extra pending" },
      { textEntries: [], pendingText: "" },
    ]) {
      const restored = restoreSourceText({ rawText, ...metadata })
      expect(restored).toEqual({ entries: [rawText], pending: "" })
      expect(serializeSourceText(restored)).toBe(rawText)
    }
  })

  it("rejects malformed and sparse metadata even if joining it could mimic rawText", () => {
    const sparse = new Array(1)
    const invalid: unknown[] = [
      { textEntries: "legacy", pendingText: "" },
      { textEntries: ["legacy", 2], pendingText: "" },
      { textEntries: null, pendingText: "" },
      { textEntries: ["legacy"], pendingText: null },
      { textEntries: ["legacy"], pendingText: 0 },
      { textEntries: sparse, pendingText: "" },
    ]
    for (const metadata of invalid) {
      expect(restoreSourceText({ rawText: "legacy", ...(metadata as Record<string, unknown>) } as Parameters<typeof restoreSourceText>[0])).toEqual({ entries: ["legacy"], pending: "" })
    }
    expect(restoreSourceText({ rawText: "", textEntries: sparse })).toEqual({ entries: [], pending: "" })
  })

  it("copies accepted entries so later caller mutations cannot rewrite restored state", () => {
    const textEntries = ["first", "first"]
    const restored = restoreSourceText({ rawText: "first\n\nfirst", textEntries })
    textEntries[0] = "changed"
    expect(restored).toEqual({ entries: ["first", "first"], pending: "" })
  })
})

type MemoryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">

function withStorage(storage: MemoryStorage, run: () => void) {
  const prior = Object.getOwnPropertyDescriptor(globalThis, "window")
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: storage } })
  try { run() }
  finally {
    if (prior) Object.defineProperty(globalThis, "window", prior)
    else Reflect.deleteProperty(globalThis, "window")
  }
}

describe("guest source metadata storage", () => {
  it("keeps full metadata with canonical text in the existing v2 draft", () => {
    const state: ComposerTextInput = { entries: ["  alpha\r\nbeta  ", "  alpha\r\nbeta  "], pending: " unsent\n" }
    const rawText = serializeSourceText(state)
    const values = new Map<string, string>([["unrelated-draft", "keep"]])
    const writtenKeys: string[] = []
    withStorage({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { writtenKeys.push(key); values.set(key, value) },
      removeItem: (key) => { values.delete(key) },
    }, () => {
      storeGuestDraft({ input: { rawText, textEntries: state.entries, pendingText: state.pending, files: [] }, selectedKind: "slides", draft: null })
      const stored = loadGuestDraft()!
      expect(stored.version).toBe(2)
      expect(stored.input.rawText).toBe(rawText)
      expect(stored.input.textEntries).toEqual(state.entries)
      expect(stored.input.pendingText).toBe(state.pending)
      expect(restoreSourceText(stored.input)).toEqual(state)
      expect(writtenKeys).toEqual(["iv:guest-draft:v2"])
      expect(values.get("unrelated-draft")).toBe("keep")
    })
  })

  it("drops only duplicate metadata when canonical text and full files still fit", () => {
    const state = { entries: ["  source\r\n".repeat(300)], pending: " unfinished\n" }
    const rawText = serializeSourceText(state)
    const fileContent = "authored file ".repeat(700)
    const previewDataUrl = "data:image/png;base64,authored-preview"
    const file = { name: "authored.txt", type: "text/plain", size: fileContent.length, content: fileContent, previewDataUrl }
    const quota = JSON.stringify(rawText).length + JSON.stringify(fileContent).length + JSON.stringify(previewDataUrl).length + 800
    const values = new Map<string, string>([["unrelated-draft", "keep"]])
    const attempts: string[] = []
    withStorage({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        attempts.push(value)
        if (value.length > quota) throw new Error("QuotaExceededError")
        values.set(key, value)
      },
      removeItem: (key) => { values.delete(key) },
    }, () => {
      storeGuestDraft({ input: { rawText, textEntries: state.entries, pendingText: state.pending, files: [file] }, selectedKind: "slides", draft: null })
      expect(attempts).toHaveLength(2)
      const stored = loadGuestDraft()!
      expect(stored.input.rawText).toBe(rawText)
      expect(stored.input).not.toHaveProperty("textEntries")
      expect(stored.input).not.toHaveProperty("pendingText")
      expect(stored.input.files).toEqual([file])
      expect(serializeSourceText(restoreSourceText(stored.input))).toBe(rawText)
      expect(values.get("unrelated-draft")).toBe("keep")
    })
  })

  it("preserves all raw text and existing file clipping when even metadata-free full files exceed quota", () => {
    const state = { entries: ["  original\r\n".repeat(350), "duplicate", "duplicate"], pending: " unfinished\n\n" }
    const rawText = serializeSourceText(state)
    const fileContent = "file source ".repeat(800)
    const quota = JSON.stringify(rawText).length + JSON.stringify(fileContent.slice(0, 4000)).length + 800
    const values = new Map<string, string>([["unrelated-draft", "keep"]])
    const attempts: { key: string; value: string }[] = []
    withStorage({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        attempts.push({ key, value })
        if (value.length > quota) throw new Error("QuotaExceededError")
        values.set(key, value)
      },
      removeItem: (key) => { values.delete(key) },
    }, () => {
      storeGuestDraft({ input: { rawText, textEntries: state.entries, pendingText: state.pending,
        files: [{ name: "authored.txt", type: "text/plain", size: fileContent.length, content: fileContent, previewDataUrl: "data:image/png;base64,authored-preview" }] }, selectedKind: "slides", draft: null })
      expect(attempts).toHaveLength(3)
      expect(attempts.map((attempt) => attempt.key)).toEqual(["iv:guest-draft:v2", "iv:guest-draft:v2", "iv:guest-draft:v2"])
      const stored = loadGuestDraft()!
      expect(stored.input.rawText).toBe(rawText)
      expect(stored.input).not.toHaveProperty("textEntries")
      expect(stored.input).not.toHaveProperty("pendingText")
      expect(stored.input.files).toEqual([{ name: "authored.txt", type: "text/plain", size: fileContent.length, content: fileContent.slice(0, 4000) }])
      expect(serializeSourceText(restoreSourceText(stored.input))).toBe(rawText)
      expect(restoreSourceText(stored.input)).toEqual({ entries: [rawText], pending: "" })
      expect(values.get("unrelated-draft")).toBe("keep")
    })
  })
})
