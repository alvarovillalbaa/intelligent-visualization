"use client"

import { useId, useRef, useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

import { moveAt } from "./editor-helpers"

export function TextField({ label, value, onChange, multiline = false, description, type = "text", autoFocus = false }: {
  label: string
  value: string
  onChange: (value: string) => void
  multiline?: boolean
  description?: string
  type?: "text" | "url"
  autoFocus?: boolean
}) {
  const id = useId()
  const helpID = description ? `${id}-help` : undefined
  return (
    <div className="grid min-w-0 gap-2">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      {multiline ? (
        <Textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} aria-describedby={helpID} className="min-h-24" />
      ) : (
        <Input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} aria-describedby={helpID} className="min-h-11" autoFocus={autoFocus} />
      )}
      {description ? <p id={helpID} className="text-xs leading-5 text-muted-foreground">{description}</p> : null}
    </div>
  )
}

export function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const id = useId()
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <Input id={id} type="number" min={1} step={1} inputMode="numeric" value={Number.isFinite(value) ? value : ""}
        onChange={(event) => onChange(event.target.value === "" ? Number.NaN : Number(event.target.value))} className="min-h-11" />
    </div>
  )
}

export function SelectField<T extends string>({ label, value, options, onChange }: {
  label: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}) {
  const id = useId()
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value as T)}
        className="min-h-11 w-full min-w-0 rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  )
}

export function EditorSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="grid min-w-0 gap-5 rounded-2xl border border-border p-4 sm:p-6">
      <header className="grid gap-1">
        <h3 className="text-base font-semibold">{title}</h3>
        {description ? <p className="text-sm leading-6 text-muted-foreground">{description}</p> : null}
      </header>
      {children}
    </section>
  )
}

export function ReorderControls({ label, index, count, onMove, onRemove, removeDisabled = false }: {
  label: string
  index: number
  count: number
  onMove: (offset: -1 | 1) => void
  onRemove: () => void
  removeDisabled?: boolean
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" className="min-h-11" disabled={index === 0} aria-label={`Move ${label} up`} onClick={() => onMove(-1)}>Move up</Button>
      <Button type="button" variant="outline" className="min-h-11" disabled={index === count - 1} aria-label={`Move ${label} down`} onClick={() => onMove(1)}>Move down</Button>
      <Button type="button" variant="destructive" className="min-h-11" disabled={removeDisabled} aria-label={`Remove ${label}`} onClick={onRemove}>Remove</Button>
    </div>
  )
}

export function StringList({ label, values, onChange, minimum = 0, description }: {
  label: string
  values: string[]
  onChange: (values: string[]) => void
  minimum?: number
  description?: string
}) {
  const id = useId()
  const counter = useRef(values.length)
  const [keys, setKeys] = useState(() => values.map((_, index) => `${id}-${index}`))
  return (
    <fieldset className="grid min-w-0 gap-3">
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      {description ? <p className="text-xs leading-5 text-muted-foreground">{description}</p> : null}
      {values.map((value, index) => (
        <div key={keys[index]} className="grid gap-2 rounded-xl border border-border p-3">
          <TextField label={`${label} ${index + 1}`} value={value} multiline onChange={(text) => onChange(values.map((entry, position) => position === index ? text : entry))} />
          <ReorderControls label={`${label.toLowerCase()} ${index + 1}`} index={index} count={values.length} removeDisabled={values.length <= minimum}
            onMove={(offset) => { setKeys(moveAt(keys, index, offset)); onChange(moveAt(values, index, offset)) }}
            onRemove={() => { setKeys(keys.filter((_, position) => position !== index)); onChange(values.filter((_, position) => position !== index)) }} />
        </div>
      ))}
      <Button type="button" variant="outline" className="min-h-11 justify-self-start" onClick={() => {
        setKeys([...keys, `${id}-${counter.current++}`])
        onChange([...values, ""])
      }}>Add {label.toLowerCase()} item</Button>
    </fieldset>
  )
}
