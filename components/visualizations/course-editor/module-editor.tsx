"use client"

import { Button } from "@/components/ui/button"
import { createCourseLesson } from "@/lib/client/course-authoring"
import type { CourseModule } from "@/packages/domain/entities"

import { moveAt, type UpdateCourseDraft } from "./editor-helpers"
import { ReorderControls, TextField } from "./fields"
import { LessonEditor, type LessonOption } from "./lesson-editor"

export function ModuleEditor({ module, index, count, lessons, update, onMove, onRemove, onRemoveLesson }: {
  module: CourseModule
  index: number
  count: number
  lessons: LessonOption[]
  update: UpdateCourseDraft
  onMove: (offset: -1 | 1) => void
  onRemove: () => void
  onRemoveLesson: (lessonID: string) => void
}) {
  const patch = (change: (value: CourseModule) => void) => update((next) => {
    const value = next.course.modules.find((entry) => entry.id === module.id)
    if (value) change(value)
  })
  return (
    <section className="grid min-w-0 gap-4 rounded-2xl border border-border p-3 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="min-w-0 break-words text-lg font-semibold">Module {index + 1}: {module.title || "Untitled module"}</h3>
        <ReorderControls label={`module ${module.title || String(index + 1)}`} index={index} count={count} onMove={onMove} onRemove={onRemove} removeDisabled={count <= 1} />
      </header>
      <details open className="min-w-0">
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">Module fields and lessons</summary>
        <div className="grid min-w-0 gap-5 pt-3">
          <TextField label="Module title" value={module.title} onChange={(value) => patch((next) => { next.title = value })} />
          <TextField label="Module objective" value={module.objective} multiline onChange={(value) => patch((next) => { next.objective = value })} />
          {module.lessons.map((lesson, lessonIndex) => (
            <LessonEditor key={lesson.id} moduleID={module.id} lesson={lesson} index={lessonIndex} count={module.lessons.length} lessons={lessons} update={update}
              onMove={(offset) => patch((next) => { next.lessons = moveAt(next.lessons, next.lessons.findIndex((entry) => entry.id === lesson.id), offset) })}
              onRemove={() => onRemoveLesson(lesson.id)} />
          ))}
          <Button type="button" variant="outline" className="min-h-11 justify-self-start" onClick={() => patch((next) => { next.lessons.push(createCourseLesson()) })}>Add lesson</Button>
        </div>
      </details>
    </section>
  )
}
