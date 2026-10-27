"use client"

import { useId } from "react"

import { Button } from "@/components/ui/button"
import type { CourseLesson } from "@/packages/domain/entities"

import { BlockListEditor } from "./block-editor"
import type { UpdateCourseDraft } from "./editor-helpers"
import { NumberField, ReorderControls, StringList, TextField } from "./fields"

export interface LessonOption { id: string; title: string; moduleTitle: string }

function LessonPrerequisites({ lesson, lessons, onChange }: { lesson: CourseLesson; lessons: LessonOption[]; onChange: (ids: string[]) => void }) {
  const id = useId()
  const knownIDs = new Set(lessons.map((entry) => entry.id))
  const unknown = lesson.prerequisiteIds.filter((entry) => !knownIDs.has(entry) || entry === lesson.id)
  return (
    <fieldset className="grid gap-2 rounded-xl border border-border p-3">
      <legend className="px-1 text-sm font-medium">Required lessons</legend>
      <p className="text-xs leading-5 text-muted-foreground">Choose lessons a learner should complete first. Circular dependencies must be resolved before applying.</p>
      {lessons.filter((entry) => entry.id !== lesson.id).map((entry, index) => (
        <label key={entry.id} htmlFor={`${id}-${index}`} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input id={`${id}-${index}`} type="checkbox" className="size-5 shrink-0 accent-primary" checked={lesson.prerequisiteIds.includes(entry.id)} onChange={(event) => {
            onChange(event.target.checked ? [...lesson.prerequisiteIds, entry.id] : lesson.prerequisiteIds.filter((value) => value !== entry.id))
          }} />
          <span>{entry.title || "Untitled lesson"}<span className="ml-1 text-muted-foreground">({entry.moduleTitle || "Untitled module"})</span></span>
        </label>
      ))}
      {lessons.length <= 1 ? <p className="text-sm text-muted-foreground">Add another lesson to choose a prerequisite.</p> : null}
      {unknown.map((entry, index) => (
        <div key={`${entry}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 p-3">
          <p className="min-w-0 break-all text-sm">{entry === lesson.id ? "This lesson cannot require itself" : "Unavailable lesson"}: {entry}</p>
          <Button type="button" variant="outline" className="min-h-11" aria-label={`Remove unavailable prerequisite ${entry}`} onClick={() => onChange(lesson.prerequisiteIds.filter((value) => value !== entry))}>Remove link</Button>
        </div>
      ))}
    </fieldset>
  )
}

export function LessonEditor({ moduleID, lesson, index, count, lessons, update, onMove, onRemove }: {
  moduleID: string
  lesson: CourseLesson
  index: number
  count: number
  lessons: LessonOption[]
  update: UpdateCourseDraft
  onMove: (offset: -1 | 1) => void
  onRemove: () => void
}) {
  const patch = (change: (value: CourseLesson) => void) => update((next) => {
    const value = next.course.modules.find((module) => module.id === moduleID)?.lessons.find((entry) => entry.id === lesson.id)
    if (value) change(value)
  })
  return (
    <section className="grid min-w-0 gap-4 rounded-2xl border border-border p-3 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <h4 className="min-w-0 break-words text-base font-semibold">Lesson {index + 1}: {lesson.title || "Untitled lesson"}</h4>
        <ReorderControls label={`lesson ${lesson.title || String(index + 1)}`} index={index} count={count} onMove={onMove} onRemove={onRemove} removeDisabled={count <= 1} />
      </header>
      <details open className="min-w-0">
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">Lesson fields and blocks</summary>
        <div className="grid min-w-0 gap-5 pt-3">
          <TextField label="Lesson title" value={lesson.title} onChange={(value) => patch((next) => { next.title = value })} />
          <TextField label="Lesson objective" value={lesson.objective} multiline onChange={(value) => patch((next) => { next.objective = value })} />
          <NumberField label="Estimated lesson minutes" value={lesson.estimatedMinutes} onChange={(value) => patch((next) => { next.estimatedMinutes = value })} />
          <LessonPrerequisites lesson={lesson} lessons={lessons} onChange={(value) => patch((next) => { next.prerequisiteIds = value })} />
          <TextField label="Explanation" value={lesson.explanation} multiline onChange={(value) => patch((next) => { next.explanation = value })} />
          <BlockListEditor label="Content" blocks={lesson.blocks} onChange={(value) => patch((next) => { next.blocks = value })} />
          <BlockListEditor label="Practice" blocks={lesson.practice} onChange={(value) => patch((next) => { next.practice = value })} />
          <TextField label="Lesson feedback" value={lesson.feedback} multiline onChange={(value) => patch((next) => { next.feedback = value })} />
          <TextField label="Lesson summary" value={lesson.summary} multiline onChange={(value) => patch((next) => { next.summary = value })} />
          <StringList label="Lesson references" values={lesson.references} description="Keep a citation, title, note or URL in each entry. These references are freeform text."
            onChange={(value) => patch((next) => { next.references = value })} />
        </div>
      </details>
    </section>
  )
}
