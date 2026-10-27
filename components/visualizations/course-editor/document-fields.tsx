"use client"

import type { CourseVisualizationDocument } from "@/packages/domain/entities"

import type { UpdateCourseDraft } from "./editor-helpers"
import { EditorSection, NumberField, SelectField, StringList, TextField } from "./fields"

export function DocumentFields({ draft, update }: { draft: CourseVisualizationDocument; update: UpdateCourseDraft }) {
  const { course } = draft
  return (
    <>
      <EditorSection title="Course details">
        <TextField label="Title" value={draft.title} autoFocus onChange={(value) => update((next) => { next.title = value })} />
        <TextField label="Subtitle" value={draft.subtitle ?? ""} onChange={(value) => update((next) => { if (value) next.subtitle = value; else delete next.subtitle })} />
        <TextField label="Summary" value={draft.summary} multiline onChange={(value) => update((next) => { next.summary = value })} />
        <TextField label="Audience" value={draft.audience} onChange={(value) => update((next) => { next.audience = value })} />
        <TextField label="Goal" value={draft.goal} multiline onChange={(value) => update((next) => { next.goal = value })} />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField label="Search title" value={draft.seo.title} onChange={(value) => update((next) => { next.seo.title = value })} />
          <TextField label="Search description" value={draft.seo.description} multiline onChange={(value) => update((next) => { next.seo.description = value })} />
        </div>
      </EditorSection>
      <EditorSection title="Learning plan">
        <TextField label="Course mission" value={course.mission} multiline onChange={(value) => update((next) => { next.course.mission = value })} />
        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField<CourseVisualizationDocument["course"]["learnerProfile"]["level"]> label="Learner level" value={course.learnerProfile.level} options={[
            { value: "beginner", label: "Beginner" }, { value: "intermediate", label: "Intermediate" },
            { value: "advanced", label: "Advanced" }, { value: "mixed", label: "Mixed" },
          ]} onChange={(value) => update((next) => { next.course.learnerProfile.level = value })} />
          <NumberField label="Estimated course minutes" value={course.estimatedMinutes} onChange={(value) => update((next) => { next.course.estimatedMinutes = value })} />
        </div>
        <StringList label="Learning objectives" values={course.learningObjectives} minimum={1} onChange={(value) => update((next) => { next.course.learningObjectives = value })} />
        <StringList label="Course prerequisites" values={course.prerequisites} onChange={(value) => update((next) => { next.course.prerequisites = value })} />
        <StringList label="Assumed knowledge" values={course.learnerProfile.assumedKnowledge} onChange={(value) => update((next) => { next.course.learnerProfile.assumedKnowledge = value })} />
        <StringList label="Learner goals" values={course.learnerProfile.goals} onChange={(value) => update((next) => { next.course.learnerProfile.goals = value })} />
        <StringList label="Learner constraints" values={course.learnerProfile.constraints} onChange={(value) => update((next) => { next.course.learnerProfile.constraints = value })} />
      </EditorSection>
    </>
  )
}
