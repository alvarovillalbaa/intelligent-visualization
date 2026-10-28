"use client"

import { useEffect, useId, useRef, useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { createCourseModule, validateCourseEdit } from "@/lib/client/course-authoring"
import type { CourseVisualizationDocument } from "@/packages/domain/entities"

import { CollectionsEditor } from "./course-editor/collections-editor"
import { DocumentFields } from "./course-editor/document-fields"
import { moveAt, removeLessonLinks, type UpdateCourseDraft } from "./course-editor/editor-helpers"
import { ModuleEditor } from "./course-editor/module-editor"
import { CoursePreview } from "./renderers/course-preview"

export interface CourseEditorProps {
  document: CourseVisualizationDocument
  onApply: (value: CourseVisualizationDocument) => string | null
  onCancel: () => void
  persistenceNote?: string
}

export function CourseEditor({ document: initialDocument, onApply, onCancel, persistenceNote }: CourseEditorProps) {
  // The parent keys each editing context. Later prop updates never replace an unapplied local draft.
  const [draft, setDraft] = useState(() => structuredClone(initialDocument))
  const [baseline] = useState(() => JSON.stringify(initialDocument))
  const [view, setView] = useState<"edit" | "preview">("edit")
  const [preview, setPreview] = useState<CourseVisualizationDocument | null>(null)
  const [previewGeneration, setPreviewGeneration] = useState(0)
  const [closeRequested, setCloseRequested] = useState(false)
  const [error, setError] = useState<{ message: string } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const errorRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const lastFocus = useRef<HTMLElement | null>(null)
  const applying = useRef(false)
  const cleanupDescriptionID = useId()
  const dirty = JSON.stringify(draft) !== baseline
  const lessons = draft.course.modules.flatMap((module) => module.lessons.map((lesson) => ({ id: lesson.id, title: lesson.title, moduleTitle: module.title })))

  useEffect(() => { if (error) errorRef.current?.focus() }, [error])
  useEffect(() => { if (closeRequested) closeRef.current?.focus() }, [closeRequested])

  const update: UpdateCourseDraft = (change) => {
    setDraft((current) => { const next = structuredClone(current); change(next); return next })
    setError(null)
    setNotice(null)
    setCloseRequested(false)
  }

  function requestClose() {
    if (!dirty) { onCancel(); return }
    lastFocus.current = globalThis.document.activeElement instanceof HTMLElement ? globalThis.document.activeElement : null
    setCloseRequested(true)
  }

  function keepEditing() {
    setCloseRequested(false)
    requestAnimationFrame(() => {
      const target = lastFocus.current
      if (target?.isConnected && formRef.current?.contains(target)) target.focus()
    })
  }

  function showPreview() {
    try {
      setPreview(validateCourseEdit(draft))
      setPreviewGeneration((value) => value + 1)
      setView("preview")
      setError(null)
      setCloseRequested(false)
    } catch (cause) {
      setView("edit")
      setError({ message: cause instanceof Error ? cause.message : "The draft could not be previewed. Check the course fields." })
    }
  }

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (applying.current) return
    applying.current = true
    setCloseRequested(false)
    try {
      const value = validateCourseEdit(draft)
      const message = onApply(value)
      if (message !== null) { setView("edit"); setError({ message }) }
    } catch (cause) {
      setView("edit")
      setError({ message: cause instanceof Error ? cause.message : "The course could not be applied. Your fields are still here." })
    } finally { applying.current = false }
  }

  function removeModule(moduleID: string) {
    update((next) => {
      if (next.course.modules.length <= 1) return
      const courseModule = next.course.modules.find((entry) => entry.id === moduleID)
      if (!courseModule) return
      const removedIDs = new Set(courseModule.lessons.map((lesson) => lesson.id))
      next.course.modules = next.course.modules.filter((entry) => entry.id !== moduleID)
      removeLessonLinks(next, removedIDs)
    })
    setNotice("Module removed. Prerequisite links to its lessons were also removed from this draft.")
  }

  function removeLesson(moduleID: string, lessonID: string) {
    update((next) => {
      const courseModule = next.course.modules.find((entry) => entry.id === moduleID)
      if (!courseModule || courseModule.lessons.length <= 1) return
      courseModule.lessons = courseModule.lessons.filter((entry) => entry.id !== lessonID)
      removeLessonLinks(next, new Set([lessonID]))
    })
    setNotice("Lesson removed. Prerequisite links to it were also removed from this draft.")
  }

  return (
    <Dialog open onOpenChange={(open, details) => {
      if (!open) { if (dirty) details.cancel(); requestClose() }
    }}>
      <DialogContent showCloseButton={false} className="flex h-[92dvh] max-h-[960px] w-[96vw] max-w-6xl flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-6xl">
        <form ref={formRef} noValidate onSubmit={apply} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader className="shrink-0 gap-4 border-b border-border p-4 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="grid gap-2">
                <DialogTitle>Edit course</DialogTitle>
                <DialogDescription>Make changes in this draft, preview them, then apply when ready.</DialogDescription>
              </div>
              <Button type="button" variant="ghost" className="min-h-11 shrink-0" onClick={requestClose}>Close</Button>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Editor view">
              <Button type="button" variant={view === "edit" ? "secondary" : "outline"} className="min-h-11" aria-pressed={view === "edit"} onClick={() => setView("edit")}>Edit fields</Button>
              <Button type="button" variant={view === "preview" ? "secondary" : "outline"} className="min-h-11" aria-pressed={view === "preview"} onClick={showPreview}>Preview draft</Button>
            </div>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
            {closeRequested ? (
              <div ref={closeRef} tabIndex={-1} role="group" aria-label="Discard unapplied changes?" className="mb-5 grid gap-3 rounded-xl border border-border p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <p className="text-sm">You have unapplied changes. Keep editing, or discard this draft&apos;s changes.</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" className="min-h-11" onClick={keepEditing}>Keep editing</Button>
                  <Button type="button" variant="destructive" className="min-h-11" onClick={onCancel}>Discard changes</Button>
                </div>
              </div>
            ) : null}
            {error ? <div ref={errorRef} role="alert" tabIndex={-1} className="mb-5 max-h-40 overflow-y-auto whitespace-pre-line rounded-xl border border-destructive/40 p-3 text-sm text-destructive outline-none focus-visible:ring-2 focus-visible:ring-ring">{error.message}</div> : null}
            {view === "preview" && preview ? (
              <section aria-label="Unapplied course preview" className="overflow-hidden rounded-xl border border-border">
                <p className="border-b border-border p-4 text-sm text-muted-foreground">Preview of your unapplied draft. Return to Edit fields to make changes.</p>
                <CoursePreview key={previewGeneration} document={preview} />
              </section>
            ) : (
              <div className="grid min-w-0 gap-6">
                <DocumentFields draft={draft} update={update} />
                <section className="grid min-w-0 gap-5" aria-label="Modules and lessons" aria-describedby={cleanupDescriptionID}>
                  <div className="grid gap-2">
                    <h3 className="text-lg font-semibold">Modules and lessons</h3>
                    <p id={cleanupDescriptionID} className="text-sm leading-6 text-muted-foreground">Keep at least one module and one lesson per module. Removing a lesson or module also removes prerequisite links to its lessons.</p>
                  </div>
                  {notice ? <p role="status" className="rounded-xl border border-border p-3 text-sm">{notice}</p> : null}
                  {draft.course.modules.map((module, index) => (
                    <ModuleEditor key={module.id} module={module} index={index} count={draft.course.modules.length} lessons={lessons} update={update}
                      onMove={(offset) => update((next) => { next.course.modules = moveAt(next.course.modules, next.course.modules.findIndex((entry) => entry.id === module.id), offset) })}
                      onRemove={() => removeModule(module.id)} onRemoveLesson={(lessonID) => removeLesson(module.id, lessonID)} />
                  ))}
                  <Button type="button" variant="outline" className="min-h-11 justify-self-start" onClick={() => update((next) => { next.course.modules.push(createCourseModule()) })}>Add module</Button>
                </section>
                <CollectionsEditor draft={draft} update={update} />
              </div>
            )}
          </div>
          <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border p-4 sm:px-6">
            <p className="min-w-0 flex-1 basis-60 text-xs leading-5 text-muted-foreground">{persistenceNote ?? "Apply updates this draft. Saving and publishing are separate actions."}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="min-h-11" onClick={requestClose}>Cancel</Button>
              <Button type="submit" className="min-h-11">Apply changes</Button>
            </div>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  )
}
