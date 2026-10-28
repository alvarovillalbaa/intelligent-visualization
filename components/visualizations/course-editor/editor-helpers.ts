import type { CourseVisualizationDocument } from "@/packages/domain/entities"

export type UpdateCourseDraft = (change: (draft: CourseVisualizationDocument) => void) => void

export function moveAt<T>(items: T[], index: number, offset: -1 | 1): T[] {
  const target = index + offset
  if (index < 0 || target < 0 || index >= items.length || target >= items.length) return items
  const next = [...items]
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item)
  return next
}

export function removeLessonLinks(draft: CourseVisualizationDocument, removedIDs: Set<string>) {
  for (const courseModule of draft.course.modules) {
    for (const lesson of courseModule.lessons) {
      lesson.prerequisiteIds = lesson.prerequisiteIds.filter((id) => !removedIDs.has(id))
    }
  }
}

export function moveAnswerIndex(answer: number, from: number, offset: -1 | 1): number {
  const to = from + offset
  if (answer === from) return to
  if (answer === to) return from
  return answer
}
