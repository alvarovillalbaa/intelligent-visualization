"use client"

import { Button } from "@/components/ui/button"
import type { CourseVisualizationDocument } from "@/packages/domain/entities"

import { moveAt, type UpdateCourseDraft } from "./editor-helpers"
import { EditorSection, ReorderControls, TextField } from "./fields"

export function CollectionsEditor({ draft, update }: { draft: CourseVisualizationDocument; update: UpdateCourseDraft }) {
  return (
    <>
      <EditorSection title="Glossary">
        {draft.course.glossary.length === 0 ? <p className="text-sm text-muted-foreground">No glossary entries yet.</p> : null}
        {draft.course.glossary.map((entry, index) => (
          <div key={entry.id} className="grid gap-4 rounded-xl border border-border p-3">
            <TextField label={`Term ${index + 1}`} value={entry.term} onChange={(value) => update((next) => {
              const target = next.course.glossary.find((item) => item.id === entry.id)
              if (target) target.term = value
            })} />
            <TextField label={`Definition ${index + 1}`} value={entry.definition} multiline onChange={(value) => update((next) => {
              const target = next.course.glossary.find((item) => item.id === entry.id)
              if (target) target.definition = value
            })} />
            <ReorderControls label={`glossary entry ${index + 1}`} index={index} count={draft.course.glossary.length}
              onMove={(offset) => update((next) => { next.course.glossary = moveAt(next.course.glossary, next.course.glossary.findIndex((item) => item.id === entry.id), offset) })}
              onRemove={() => update((next) => { next.course.glossary = next.course.glossary.filter((item) => item.id !== entry.id) })} />
          </div>
        ))}
        <Button type="button" variant="outline" className="min-h-11 justify-self-start" onClick={() => update((next) => {
          next.course.glossary.push({ id: crypto.randomUUID(), term: "", definition: "" })
        })}>Add glossary entry</Button>
      </EditorSection>
      <EditorSection title="Course references" description="Add a title and a complete HTTP or HTTPS address for each linked reference. HTTPS is recommended. Lesson references remain separate freeform citations.">
        {draft.course.references.length === 0 ? <p className="text-sm text-muted-foreground">No linked course references yet.</p> : null}
        {draft.course.references.map((entry, index) => (
          <div key={entry.id} className="grid gap-4 rounded-xl border border-border p-3">
            <TextField label={`Reference title ${index + 1}`} value={entry.title} onChange={(value) => update((next) => {
              const target = next.course.references.find((item) => item.id === entry.id)
              if (target) target.title = value
            })} />
            <TextField label={`Reference web address ${index + 1}`} value={entry.href} type="url" onChange={(value) => update((next) => {
              const target = next.course.references.find((item) => item.id === entry.id)
              if (target) target.href = value
            })} />
            <TextField label={`Reference note ${index + 1}`} value={entry.note} multiline onChange={(value) => update((next) => {
              const target = next.course.references.find((item) => item.id === entry.id)
              if (target) target.note = value
            })} />
            <ReorderControls label={`course reference ${index + 1}`} index={index} count={draft.course.references.length}
              onMove={(offset) => update((next) => { next.course.references = moveAt(next.course.references, next.course.references.findIndex((item) => item.id === entry.id), offset) })}
              onRemove={() => update((next) => { next.course.references = next.course.references.filter((item) => item.id !== entry.id) })} />
          </div>
        ))}
        <Button type="button" variant="outline" className="min-h-11 justify-self-start" onClick={() => update((next) => {
          next.course.references.push({ id: crypto.randomUUID(), title: "", href: "", note: "" })
        })}>Add course reference</Button>
      </EditorSection>
    </>
  )
}
