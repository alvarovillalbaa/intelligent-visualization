"use client"

import { useId } from "react"
import { Input } from "@/components/ui/input"

export { TextField, SelectField, EditorSection, StringList } from "../course-editor/fields"

export function NumericField({ label, value, min = 0, max, disabled, onChange }: {
  label: string; value: string; min?: number; max?: number; disabled?: boolean; onChange: (value: string) => void
}) {
  const id = useId()
  return <div className="grid min-w-0 gap-2">
    <label htmlFor={id} className="text-sm font-medium">{label}</label>
    <Input id={id} type="number" inputMode="numeric" min={min} max={max} step={1} disabled={disabled}
      value={value} className="min-h-11" onChange={(event) => onChange(event.target.value)} />
  </div>
}

export function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  const id = useId()
  return <label htmlFor={id} className="flex min-h-11 items-center gap-3 text-sm font-medium">
    <input id={id} type="checkbox" className="size-5" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    {label}
  </label>
}
