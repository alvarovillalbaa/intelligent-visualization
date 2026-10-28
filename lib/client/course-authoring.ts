import type { GenerationBatch } from "@/lib/client/generation-batch"
import type { GeneratedDraft } from "@/lib/client/guest-draft"
import type { CourseBlock, CourseLesson, CourseModule, CourseVisualizationDocument } from "@/packages/domain/entities"
import { courseDocumentSchema } from "@/packages/domain/schemas"

// Client authoring limits, not a change to stored or provider-owned schemas.
export const COURSE_AUTHORING_LIMITS = {
  bytes: 2 * 1024 * 1024,
  depth: 16,
  nodes: 100_000,
  arrayItems: 512,
  modules: 32,
  lessons: 256,
  blocksPerLesson: 512,
  blocks: 4096,
  options: 32,
  listItems: 256,
  glossary: 256,
  references: 256,
} as const

function invalid(message: string): never { throw new Error(message) }

// Bound traversal before Zod or JSON serialization. Sorting keys also lets us
// detect fields that the existing non-strict schema would otherwise discard.
function courseJson(value: unknown): string {
  const parts: string[] = []
  const ancestors = new Set<object>()
  const encoder = new TextEncoder()
  let bytes = 0
  let nodes = 0
  const append = (text: string) => {
    bytes += encoder.encode(text).byteLength
    if (bytes > COURSE_AUTHORING_LIMITS.bytes) invalid("Course edits must be at most 2 MiB of JSON. Shorten the content before applying.")
    parts.push(text)
  }
  const visit = (entry: unknown, depth: number) => {
    if (++nodes > COURSE_AUTHORING_LIMITS.nodes || depth > COURSE_AUTHORING_LIMITS.depth) invalid("This course is too complex to edit. Reduce its nested content.")
    if (entry === null || typeof entry === "boolean") { append(JSON.stringify(entry)); return }
    if (typeof entry === "string") {
      if (entry.length > COURSE_AUTHORING_LIMITS.bytes) invalid("Course edits must be at most 2 MiB of JSON. Shorten the content before applying.")
      append(JSON.stringify(entry)); return
    }
    if (typeof entry === "number") {
      if (!Number.isFinite(entry)) invalid("Course numbers must be finite.")
      append(JSON.stringify(entry)); return
    }
    if (typeof entry !== "object" || !entry) invalid("Course edits must contain ordinary JSON values, without missing values or functions.")
    if (ancestors.has(entry)) invalid("Course edits cannot contain circular references.")
    ancestors.add(entry)
    if (Array.isArray(entry)) {
      if (entry.length > COURSE_AUTHORING_LIMITS.arrayItems) invalid("A course list can contain at most 512 entries.")
      if (Reflect.ownKeys(entry).length !== entry.length + 1) invalid("Course lists cannot contain missing entries or extra fields.")
      append("[")
      for (let index = 0; index < entry.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(entry, String(index))
        if (!descriptor || !("value" in descriptor)) invalid("Course lists cannot contain missing entries or computed values.")
        if (index) append(",")
        visit(descriptor.value, depth + 1)
      }
      append("]")
    } else {
      const prototype = Object.getPrototypeOf(entry)
      if (prototype !== null && Object.getPrototypeOf(prototype) !== null) invalid("Course edits must contain ordinary JSON objects.")
      const keys = Reflect.ownKeys(entry)
      if (keys.some((key) => typeof key !== "string") || keys.length > COURSE_AUTHORING_LIMITS.nodes) invalid("Course edits contain unsupported object fields.")
      append("{")
      for (const [index, key] of (keys as string[]).sort().entries()) {
        const descriptor = Object.getOwnPropertyDescriptor(entry, key)
        if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid("Course edits cannot contain hidden or computed fields.")
        if (index) append(",")
        append(JSON.stringify(key)); append(":")
        visit(descriptor.value, depth + 1)
      }
      append("}")
    }
    ancestors.delete(entry)
  }
  visit(value, 0)
  return parts.join("")
}

function boundedList(values: unknown[], label: string, limit: number = COURSE_AUTHORING_LIMITS.listItems) {
  if (values.length > limit) invalid(`${label} can contain at most ${limit} entries.`)
}

function nonblank(value: string, label: string) {
  if (!value.trim()) invalid(`${label} cannot be blank.`)
}

export function validateCourseEdit(value: unknown): CourseVisualizationDocument {
  const before = courseJson(value)
  const parsed = courseDocumentSchema.safeParse(value)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    invalid(`Check ${issue.path.join(".") || "the course"}: ${issue.message}`)
  }
  const document = parsed.data as CourseVisualizationDocument
  if (courseJson(document) !== before) invalid("The course contains unsupported fields. Keep the original content and remove those fields before applying.")
  for (const [label, text] of Object.entries({ Title: document.title, Summary: document.summary, Audience: document.audience, Goal: document.goal,
    "SEO title": document.seo.title, "SEO description": document.seo.description, Mission: document.course.mission })) nonblank(text, label)
  nonblank(document.theme.id, "Theme ID")
  const ids = new Set<string>()
  const identify = (id: string, label: string) => {
    nonblank(id, `${label} ID`)
    if (ids.has(id)) invalid(`Duplicate ID “${id}”. Give each course item its own ID.`)
    ids.add(id)
  }
  const uniqueValues = (values: string[], label: string) => {
    boundedList(values, label)
    const seen = new Set<string>()
    for (const value of values) {
      nonblank(value, label)
      if (seen.has(value)) invalid(`${label} contains a duplicate entry “${value}”.`)
      seen.add(value)
    }
  }
  uniqueValues(document.assetIds, "Asset IDs")
  boundedList(document.sourceManifest, "Source manifest")
  const sourceIds = new Set<string>()
  for (const source of document.sourceManifest) {
    nonblank(source.id, "Source ID")
    if (sourceIds.has(source.id)) invalid(`Duplicate source ID “${source.id}”.`)
    sourceIds.add(source.id)
  }
  const course = document.course
  boundedList(course.modules, "Modules", COURSE_AUTHORING_LIMITS.modules)
  boundedList(course.glossary, "Glossary", COURSE_AUTHORING_LIMITS.glossary)
  boundedList(course.references, "Course references", COURSE_AUTHORING_LIMITS.references)
  for (const [label, list] of Object.entries({ "Learning objectives": course.learningObjectives, Prerequisites: course.prerequisites,
    "Assumed knowledge": course.learnerProfile.assumedKnowledge, "Learner goals": course.learnerProfile.goals, "Learner constraints": course.learnerProfile.constraints })) boundedList(list, label)
  const minutes = (value: number, label: string) => {
    if (!Number.isSafeInteger(value) || value <= 0) invalid(`${label} must be a positive whole number of minutes.`)
  }
  minutes(course.estimatedMinutes, "Course duration")
  const lessons = new Map<string, CourseLesson>()
  let blockCount = 0
  const block = (value: CourseBlock) => {
    identify(value.id, "Block")
    if (++blockCount > COURSE_AUTHORING_LIMITS.blocks) invalid("A course can contain at most 4096 blocks, including practice.")
    if (value.kind === "multiple-choice-check") {
      if (value.options.length < 2 || value.options.length > COURSE_AUTHORING_LIMITS.options) invalid("A multiple-choice check needs 2–32 options.")
      if (value.options.some((option) => !option.trim())) invalid("Multiple-choice options cannot be blank.")
      if (!Number.isSafeInteger(value.answerIndex) || value.answerIndex < 0 || value.answerIndex >= value.options.length) invalid("Choose a correct answer that exists in the multiple-choice options.")
    }
    if (value.kind === "summary") boundedList(value.items, "Summary items")
  }
  for (const courseModule of course.modules) {
    identify(courseModule.id, "Module")
    nonblank(courseModule.title, "Module title")
    if (!courseModule.lessons.length) invalid(`Add a lesson to “${courseModule.title}” before applying the course.`)
    for (const lesson of courseModule.lessons) {
      identify(lesson.id, "Lesson")
      nonblank(lesson.title, "Lesson title")
      lessons.set(lesson.id, lesson)
      if (lessons.size > COURSE_AUTHORING_LIMITS.lessons) invalid("A course can contain at most 256 lessons across its modules.")
      minutes(lesson.estimatedMinutes, `Duration for “${lesson.title}”`)
      uniqueValues(lesson.prerequisiteIds, `Prerequisites for “${lesson.title}”`)
      boundedList(lesson.references, "Lesson references")
      if (lesson.blocks.length + lesson.practice.length > COURSE_AUTHORING_LIMITS.blocksPerLesson) invalid("A lesson can contain at most 512 blocks, including practice.")
      lesson.blocks.forEach(block)
      lesson.practice.forEach(block)
    }
  }
  for (const entry of course.glossary) identify(entry.id, "Glossary entry")
  for (const reference of course.references) {
    identify(reference.id, "Reference")
    const url = new URL(reference.href)
    if (url.protocol !== "https:" && url.protocol !== "http:") invalid("Course reference links must use HTTP or HTTPS.")
  }
  // Kahn's algorithm keeps long prerequisite chains off the JavaScript stack.
  const remaining = new Map<string, number>()
  const dependents = new Map<string, string[]>()
  for (const lesson of lessons.values()) {
    remaining.set(lesson.id, lesson.prerequisiteIds.length)
    for (const prerequisite of lesson.prerequisiteIds) {
      if (prerequisite === lesson.id) invalid(`“${lesson.title}” cannot require itself.`)
      if (!lessons.has(prerequisite)) invalid(`A prerequisite for “${lesson.title}” no longer exists. Remove that dependency or restore the lesson.`)
      const next = dependents.get(prerequisite) || []
      next.push(lesson.id)
      dependents.set(prerequisite, next)
    }
  }
  const ready = [...remaining].filter(([, count]) => count === 0).map(([id]) => id)
  for (let index = 0; index < ready.length; index++) {
    for (const id of dependents.get(ready[index]) || []) {
      const count = remaining.get(id)! - 1
      remaining.set(id, count)
      if (count === 0) ready.push(id)
    }
  }
  if (ready.length !== lessons.size) invalid("Lesson prerequisites contain a cycle. Remove a dependency so learners can start.")
  return document
}

function sameDraft(left: GeneratedDraft, right: GeneratedDraft): boolean {
  const pending: Array<[unknown, unknown, number]> = [[left, right, 0]]
  let visited = 0
  while (pending.length) {
    const [a, b, depth] = pending.pop()!
    if (++visited > COURSE_AUTHORING_LIMITS.nodes * 2 || depth > COURSE_AUTHORING_LIMITS.depth + 4) return false
    if (a === b) continue
    if (!a || !b || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false
    const aKeys = Object.keys(a).sort(), bKeys = Object.keys(b).sort()
    if (aKeys.length !== bKeys.length || aKeys.some((key, index) => key !== bKeys[index])) return false
    for (const key of aKeys) pending.push([(a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], depth + 1])
  }
  return true
}

export function applyCourseDraftEdit(batch: GenerationBatch, resultId: string, expectedDraft: GeneratedDraft, edited: CourseVisualizationDocument): GenerationBatch {
  const matches = batch.results.filter((result) => result.id === resultId)
  const current = matches[0]
  if (matches.length !== 1 || current.kind !== "course" || current.status !== "completed" || !current.draft || current.draft.kind !== "course" || current.draft.document.kind !== "course") {
    invalid("This completed course is no longer available to edit. Reopen the current course.")
  }
  if (!sameDraft(current.draft, expectedDraft)) invalid("This course changed while you were editing. Reopen it before applying your changes.")
  const candidate = validateCourseEdit(edited)
  const document = structuredClone(current.draft.document)
  document.title = candidate.title
  if (candidate.subtitle === undefined) delete document.subtitle
  else document.subtitle = candidate.subtitle
  document.summary = candidate.summary
  document.audience = candidate.audience
  document.goal = candidate.goal
  document.seo = candidate.seo
  document.course = candidate.course
  const nextDraft = structuredClone(current.draft)
  nextDraft.document = validateCourseEdit(document)
  delete nextDraft.artifactHtml
  return { ...batch, results: batch.results.map((result) => result === current ? { ...result, draft: nextDraft } : result) }
}

export function createCourseBlock(kind: CourseBlock["kind"]): CourseBlock {
  const id = crypto.randomUUID()
  switch (kind) {
    case "heading": return { id, kind, text: "New heading" }
    case "prose": return { id, kind, text: "Explain the idea here." }
    case "callout": return { id, kind, title: "Key idea", body: "Add a useful reminder." }
    case "multiple-choice-check": return { id, kind, prompt: "Check your understanding", options: ["First option", "Second option"], answerIndex: 0, explanation: "Explain the correct answer." }
    case "free-recall-check": return { id, kind, prompt: "Explain the idea in your own words.", guidance: "Compare your answer with the lesson." }
    case "summary": return { id, kind, items: ["A key takeaway"] }
    default: return invalid("Choose a supported course block type.")
  }
}

export function createCourseLesson(): CourseLesson {
  return { id: crypto.randomUUID(), title: "New lesson", objective: "Describe the learning objective.", estimatedMinutes: 5,
    prerequisiteIds: [], explanation: "Introduce the concept.", blocks: [createCourseBlock("prose")], practice: [],
    feedback: "Review what you learned.", summary: "Summarize the lesson.", references: [] }
}

export function createCourseModule(): CourseModule {
  return { id: crypto.randomUUID(), title: "New module", objective: "Describe the module objective.", lessons: [createCourseLesson()] }
}
