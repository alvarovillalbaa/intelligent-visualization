"use client"

import { useState } from "react"

import type { CourseBlock, CourseVisualizationDocument } from "@/packages/domain/entities"

function CourseBlockView({ block }: { block: CourseBlock }) {
  switch (block.kind) {
    case "heading":
      return <h4 className="text-lg font-semibold">{block.text}</h4>
    case "prose":
      return <p className="leading-7 opacity-90">{block.text}</p>
    case "callout":
      return (
        <div className="rounded-lg border-l-4 p-4" style={{ borderColor: "var(--iv-accent)", backgroundColor: "var(--iv-muted)" }}>
          <p className="text-sm font-semibold">{block.title}</p>
          <p className="mt-1 text-sm leading-6 opacity-90">{block.body}</p>
        </div>
      )
    case "multiple-choice-check":
      return <MultipleChoiceCheck prompt={block.prompt} options={block.options} answerIndex={block.answerIndex} explanation={block.explanation} />
    case "free-recall-check":
      return (
        <div className="rounded-lg border p-4" style={{ borderColor: "var(--iv-border)" }}>
          <p className="text-sm font-semibold">{block.prompt}</p>
          <p className="mt-2 text-sm italic leading-6 opacity-70">{block.guidance}</p>
        </div>
      )
    case "summary":
      return (
        <ul className="grid gap-2">
          {block.items.map((item, index) => (
            <li key={index} className="flex gap-2 text-sm leading-6">
              <span className="mt-2 size-1.5 shrink-0 rounded-full" style={{ backgroundColor: "var(--iv-accent)" }} />
              {item}
            </li>
          ))}
        </ul>
      )
    default:
      return null
  }
}

function MultipleChoiceCheck({
  prompt,
  options,
  answerIndex,
  explanation,
}: {
  prompt: string
  options: string[]
  answerIndex: number
  explanation: string
}) {
  const [selected, setSelected] = useState<number | null>(null)

  return (
    <div className="rounded-lg border p-4" style={{ borderColor: "var(--iv-border)" }}>
      <p className="text-sm font-semibold">{prompt}</p>
      <div className="mt-3 grid gap-2">
        {options.map((option, index) => {
          const revealed = selected !== null
          const isAnswer = index === answerIndex
          return (
            <button
              key={index}
              type="button"
              onClick={() => setSelected(index)}
              className="rounded-md border px-3 py-2 text-left text-sm leading-6 transition"
              style={{
                borderColor: revealed && isAnswer ? "var(--iv-accent)" : "var(--iv-border)",
                backgroundColor: revealed && isAnswer ? "var(--iv-muted)" : "transparent",
                opacity: revealed && !isAnswer && selected !== index ? 0.6 : 1,
              }}
            >
              {option}
              {revealed && selected === index && !isAnswer ? " — not quite" : null}
              {revealed && isAnswer ? " ✓" : null}
            </button>
          )
        })}
      </div>
      {selected !== null ? <p className="mt-3 text-sm leading-6 opacity-80">{explanation}</p> : null}
    </div>
  )
}

export function CoursePreview({ document }: { document: CourseVisualizationDocument }) {
  const { theme, course } = document
  const lessonCount = course.modules.reduce((sum, module) => sum + module.lessons.length, 0)

  return (
    <div
      className="min-h-full"
      style={
        {
          backgroundColor: theme.background,
          color: theme.foreground,
          fontFamily: theme.bodyFont,
          "--iv-accent": theme.accent,
          "--iv-muted": theme.muted,
          "--iv-border": theme.border,
        } as React.CSSProperties
      }
    >
      <div className="mx-auto grid max-w-3xl gap-12 px-6 py-16">
        <header className="grid gap-4">
          <p className="text-xs uppercase tracking-[0.2em] opacity-60">Course</p>
          <h1 className="text-4xl font-semibold leading-tight" style={{ fontFamily: theme.displayFont }}>
            {document.title}
          </h1>
          <p className="text-lg leading-8 opacity-80">{document.summary}</p>
          <p className="text-sm opacity-60">
            {course.modules.length} modules · {lessonCount} lessons · about {course.estimatedMinutes} minutes ·{" "}
            {course.learnerProfile.level}
          </p>
        </header>

        <section className="grid gap-3 rounded-lg p-6" style={{ backgroundColor: theme.muted }}>
          <p className="text-sm font-semibold">{course.mission}</p>
          <ul className="grid gap-2">
            {course.learningObjectives.map((objective, index) => (
              <li key={index} className="flex gap-2 text-sm leading-6">
                <span className="mt-2 size-1.5 shrink-0 rounded-full" style={{ backgroundColor: theme.accent }} />
                {objective}
              </li>
            ))}
          </ul>
        </section>

        {course.modules.map((module, moduleIndex) => (
          <section key={module.id} className="grid gap-6">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] opacity-60">Module {moduleIndex + 1}</p>
              <h2 className="mt-2 text-2xl font-semibold" style={{ fontFamily: theme.displayFont }}>
                {module.title}
              </h2>
              <p className="mt-2 leading-7 opacity-80">{module.objective}</p>
            </div>

            {module.lessons.map((lesson) => (
              <article key={lesson.id} className="grid gap-4 rounded-lg border p-6" style={{ borderColor: theme.border }}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-xl font-semibold" style={{ fontFamily: theme.displayFont }}>
                    {lesson.title}
                  </h3>
                  <span className="text-xs opacity-60">{lesson.estimatedMinutes} min</span>
                </div>
                <p className="text-sm leading-6 opacity-70">{lesson.objective}</p>
                <p className="leading-7 opacity-90">{lesson.explanation}</p>

                {lesson.blocks.map((block) => (
                  <CourseBlockView key={block.id} block={block} />
                ))}

                {lesson.practice.length ? (
                  <div className="grid gap-3">
                    <p className="text-xs uppercase tracking-[0.2em] opacity-60">Practice</p>
                    {lesson.practice.map((block) => (
                      <CourseBlockView key={block.id} block={block} />
                    ))}
                  </div>
                ) : null}

                {lesson.summary ? <p className="text-sm leading-6 opacity-70">{lesson.summary}</p> : null}
              </article>
            ))}
          </section>
        ))}

        {course.glossary.length ? (
          <section className="grid gap-3">
            <h2 className="text-xl font-semibold" style={{ fontFamily: theme.displayFont }}>
              Glossary
            </h2>
            <dl className="grid gap-2">
              {course.glossary.map((entry) => (
                <div key={entry.id} className="text-sm leading-6">
                  <dt className="inline font-semibold">{entry.term}</dt>
                  <dd className="inline opacity-80"> — {entry.definition}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        {course.references.length ? (
          <section className="grid gap-3">
            <h2 className="text-xl font-semibold" style={{ fontFamily: theme.displayFont }}>
              References
            </h2>
            <ul className="grid gap-2">
              {course.references.map((reference) => (
                <li key={reference.id} className="text-sm leading-6">
                  <a href={reference.href} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                    {reference.title}
                  </a>
                  {reference.note ? <span className="opacity-70"> — {reference.note}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  )
}
