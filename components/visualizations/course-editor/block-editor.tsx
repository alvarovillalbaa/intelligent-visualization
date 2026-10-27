"use client"

import { useId, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { createCourseBlock } from "@/lib/client/course-authoring"
import type { CourseBlock } from "@/packages/domain/entities"

import { moveAnswerIndex, moveAt } from "./editor-helpers"
import { ReorderControls, SelectField, StringList, TextField } from "./fields"

const blockKinds: Array<{ value: CourseBlock["kind"]; label: string }> = [
  { value: "heading", label: "Heading" },
  { value: "prose", label: "Prose" },
  { value: "callout", label: "Callout" },
  { value: "multiple-choice-check", label: "Multiple-choice check" },
  { value: "free-recall-check", label: "Free-recall check" },
  { value: "summary", label: "Summary list" },
]

type ChoiceBlock = Extract<CourseBlock, { kind: "multiple-choice-check" }>

function ChoiceOptions({ block, onChange }: { block: ChoiceBlock; onChange: (value: ChoiceBlock) => void }) {
  const group = useId()
  const counter = useRef(block.options.length)
  const [keys, setKeys] = useState(() => block.options.map((_, index) => `${group}-${index}`))
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-2 text-sm font-medium">Answer options</legend>
      <p className="text-xs leading-5 text-muted-foreground">Choose one correct answer. If you remove it, choose another before applying.</p>
      {block.options.map((option, index) => {
        const answerID = `${keys[index]}-answer`
        return (
          <div key={keys[index]} className="grid gap-3 rounded-xl border border-border p-3">
            <TextField label={`Option ${index + 1}`} value={option} multiline onChange={(value) => onChange({ ...block, options: block.options.map((entry, position) => position === index ? value : entry) })} />
            <label htmlFor={answerID} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
              <input id={answerID} type="radio" name={group} checked={block.answerIndex === index} onChange={() => onChange({ ...block, answerIndex: index })} className="size-5 accent-primary" />
              Correct answer: option {index + 1}
            </label>
            <ReorderControls label={`option ${index + 1}`} index={index} count={block.options.length} removeDisabled={block.options.length <= 2}
              onMove={(offset) => {
                setKeys(moveAt(keys, index, offset))
                onChange({ ...block, options: moveAt(block.options, index, offset), answerIndex: moveAnswerIndex(block.answerIndex, index, offset) })
              }}
              onRemove={() => {
                setKeys(keys.filter((_, position) => position !== index))
                const answerIndex = block.answerIndex === index ? -1 : block.answerIndex > index ? block.answerIndex - 1 : block.answerIndex
                onChange({ ...block, options: block.options.filter((_, position) => position !== index), answerIndex })
              }} />
          </div>
        )
      })}
      {block.answerIndex < 0 || block.answerIndex >= block.options.length ? <p className="text-sm text-destructive">Choose a correct answer.</p> : null}
      <Button type="button" variant="outline" className="min-h-11 justify-self-start" onClick={() => {
        setKeys([...keys, `${group}-${counter.current++}`])
        onChange({ ...block, options: [...block.options, ""] })
      }}>Add answer option</Button>
    </fieldset>
  )
}

function BlockFields({ block, onChange }: { block: CourseBlock; onChange: (value: CourseBlock) => void }) {
  switch (block.kind) {
    case "heading":
      return <TextField label="Heading text" value={block.text} onChange={(text) => onChange({ ...block, text })} />
    case "prose":
      return <TextField label="Prose text" value={block.text} multiline onChange={(text) => onChange({ ...block, text })} />
    case "callout":
      return <>
        <TextField label="Callout title" value={block.title} onChange={(title) => onChange({ ...block, title })} />
        <TextField label="Callout body" value={block.body} multiline onChange={(body) => onChange({ ...block, body })} />
      </>
    case "multiple-choice-check":
      return <>
        <TextField label="Check prompt" value={block.prompt} multiline onChange={(prompt) => onChange({ ...block, prompt })} />
        <ChoiceOptions block={block} onChange={onChange} />
        <TextField label="Answer explanation" value={block.explanation} multiline onChange={(explanation) => onChange({ ...block, explanation })} />
      </>
    case "free-recall-check":
      return <>
        <TextField label="Recall prompt" value={block.prompt} multiline onChange={(prompt) => onChange({ ...block, prompt })} />
        <TextField label="Recall guidance" value={block.guidance} multiline onChange={(guidance) => onChange({ ...block, guidance })} />
      </>
    case "summary":
      return <StringList label="Summary points" values={block.items} onChange={(items) => onChange({ ...block, items })} />
  }
}

export function BlockListEditor({ label, blocks, onChange }: { label: string; blocks: CourseBlock[]; onChange: (value: CourseBlock[]) => void }) {
  const [kind, setKind] = useState<CourseBlock["kind"]>("prose")
  return (
    <section className="grid gap-4" aria-label={label}>
      <h5 className="text-sm font-semibold">{label}</h5>
      {blocks.length === 0 ? <p className="text-sm text-muted-foreground">No blocks yet. Choose a type below to add one.</p> : null}
      {blocks.map((block, index) => (
        <div key={block.id} className="grid min-w-0 gap-4 rounded-xl border border-border p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium">{index + 1}. {blockKinds.find((item) => item.value === block.kind)?.label}</p>
            <ReorderControls label={`${label.toLowerCase()} block ${index + 1}`} index={index} count={blocks.length}
              onMove={(offset) => onChange(moveAt(blocks, index, offset))}
              onRemove={() => onChange(blocks.filter((item) => item.id !== block.id))} />
          </div>
          <BlockFields block={block} onChange={(value) => onChange(blocks.map((item) => item.id === block.id ? value : item))} />
        </div>
      ))}
      <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <SelectField<CourseBlock["kind"]> label={`New ${label.toLowerCase()} block type`} value={kind} options={blockKinds} onChange={setKind} />
        <Button type="button" variant="outline" className="min-h-11" onClick={() => onChange([...blocks, createCourseBlock(kind)])}>Add {label.toLowerCase()} block</Button>
      </div>
    </section>
  )
}
