"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import type { ChartSpec, ReportBlock } from "@/packages/domain/entities"
import { CheckField, SelectField, TextField } from "./fields"

export function ChartFields({ chart, onChange }: { chart: ChartSpec; onChange: (value: ChartSpec) => void }) {
  const patch = (change: Partial<ChartSpec>) => onChange({ ...chart, ...change })
  const keys = Array.from(new Set([chart.xKey, ...chart.series.map((series) => series.key), ...chart.data.flatMap((row) => Object.keys(row))].filter((key): key is string => key !== undefined)))
  function renameKey(index: number, nextKey: string) {
    const prior = chart.series[index].key
    // Keep the values in their old column while a duplicate or empty key is being corrected.
    const migrate = nextKey.trim() !== "" && nextKey !== prior && !keys.includes(nextKey)
    const next = structuredClone(chart)
    next.series[index].key = nextKey
    if (migrate) {
      next.data = next.data.map((row) => {
        const result = { ...row }
        if (Object.hasOwn(result, prior)) { result[nextKey] = result[prior]; delete result[prior] }
        return result
      })
      if (next.xKey === prior) next.xKey = nextKey
    }
    onChange(next)
  }
  return <div className="grid min-w-0 gap-4">
    <SelectField label="Chart type" value={chart.type} options={["line", "bar", "area", "pie", "donut", "composed"].map((value) => ({ value: value as ChartSpec["type"], label: value }))} onChange={(type) => patch({ type })} />
    <TextField label="Chart title" value={chart.title} onChange={(title) => patch({ title })} />
    <TextField label="Chart description" value={chart.description} multiline onChange={(description) => patch({ description })} />
    <TextField label="Chart accessible description" value={chart.accessibleLabel} multiline onChange={(accessibleLabel) => patch({ accessibleLabel })} />
    <TextField label="Category column key" value={chart.xKey ?? ""} description="Use the key of an existing data column. Changing it keeps every data column." onChange={(xKey) => {
      const next = { ...chart }; if (xKey) next.xKey = xKey; else delete next.xKey; onChange(next)
    }} />
    <fieldset className="grid min-w-0 gap-3"><legend className="mb-2 text-sm font-semibold">Chart series</legend>
      {chart.series.map((series, index) => <div key={index} className="grid min-w-0 gap-3 rounded-xl border border-border p-3">
        <RenameKey key={`${index}:${series.key}`} label={`Series ${index + 1} key`} value={series.key} keys={keys} onRename={(value) => renameKey(index, value)} />
        <TextField label={`Series ${index + 1} label`} value={series.label} onChange={(label) => patch({ series: chart.series.map((entry, position) => position === index ? { ...entry, label } : entry) })} />
        <TextField label={`Series ${index + 1} color`} value={series.color ?? ""} description="Optional CSS color, for example #ff6f4d." onChange={(color) => {
          const next = structuredClone(chart); if (color) next.series[index].color = color; else delete next.series[index].color; onChange(next)
        }} />
        <Button type="button" variant="outline" className="min-h-11 justify-self-start" disabled={chart.series.length <= 1} onClick={() => patch({ series: chart.series.filter((_, position) => position !== index) })}>Remove series {index + 1}</Button>
      </div>)}
      <Button type="button" variant="outline" className="min-h-11 justify-self-start" onClick={() => {
        let number = chart.series.length + 1; while (keys.includes(`value${number}`)) number++
        const key = `value${number}`
        patch({ series: [...chart.series, { key, label: `Series ${number}` }], data: chart.data.map((row) => ({ ...row, [key]: null })) })
      }}>Add chart series</Button>
    </fieldset>
    <fieldset className="grid min-w-0 gap-3"><legend className="mb-2 text-sm font-semibold">Chart values</legend>
      <p className="text-xs leading-5 text-muted-foreground">Numbers, text and empty values are distinct. Changing values does not change the supplied source or provenance.</p>
      {chart.data.map((row, index) => <div key={index} className="grid min-w-0 gap-3 rounded-xl border border-border p-3">
        <p className="text-sm font-medium">Data row {index + 1}</p>
        {keys.map((key) => <DataCell key={key} label={`Row ${index + 1}, ${key}`} value={row[key] ?? null} onChange={(value) => patch({ data: chart.data.map((entry, position) => position === index ? { ...entry, [key]: value } : entry) })} />)}
        <Button type="button" variant="outline" className="min-h-11 justify-self-start" onClick={() => patch({ data: chart.data.filter((_, position) => position !== index) })}>Remove data row {index + 1}</Button>
      </div>)}
      <Button type="button" variant="outline" className="min-h-11 justify-self-start" onClick={() => patch({ data: [...chart.data, Object.fromEntries(keys.map((key) => [key, key === chart.xKey ? "New category" : null]))] })}>Add data row</Button>
    </fieldset>
    <TextField label="Chart source" value={chart.source} onChange={(source) => patch({ source })} />
    <TextField label="Chart provenance" value={chart.provenance} multiline onChange={(provenance) => patch({ provenance })} />
    <CheckField label="These chart values are illustrative" checked={chart.illustrative} onChange={(illustrative) => patch({ illustrative })} />
  </div>
}

function RenameKey({ label, value, keys, onRename }: { label: string; value: string; keys: string[]; onRename: (value: string) => void }) {
  const [next, setNext] = useState(value)
  const [error, setError] = useState<string | null>(null)
  return <div className="grid min-w-0 gap-2">
    <p className="break-all text-xs text-muted-foreground">Current key: {value}</p>
    <TextField label={`New ${label.toLowerCase()}`} value={next} description="Choose Rename key to commit this field and move its data values together." onChange={(text) => { setNext(text); setError(null) }} />
    <Button type="button" variant="outline" className="min-h-11 justify-self-start" onClick={() => {
      if (!next.trim() || (next !== value && keys.includes(next))) { setError("Choose a nonblank key that is not already used."); return }
      onRename(next)
    }}>Rename key</Button>
    {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
  </div>
}

function DataCell({ label, value, onChange }: { label: string; value: string | number | null; onChange: (value: string | number | null) => void }) {
  const type = value === null ? "empty" : typeof value === "number" ? "number" : "text"
  return <div role="group" aria-label={label} className="grid min-w-0 gap-2 rounded-lg border border-border p-2">
    <SelectField label={`${label} type`} value={type} options={[{ value: "text", label: "Text" }, { value: "number", label: "Number" }, { value: "empty", label: "Empty" }]}
      onChange={(next) => onChange(next === "empty" ? null : next === "number" ? (typeof value === "number" ? value : 0) : String(value ?? ""))} />
    {type === "number" ? <NumberDataField label={label} value={value as number} onChange={onChange} /> : type === "text" ? <TextField label={label} value={String(value)} onChange={onChange} /> : null}
  </div>
}

function NumberDataField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const [input, setInput] = useState(() => ({ value, raw: String(value) }))
  const parse = (text: string) => text.trim() === "" ? Number.NaN : Number(text)
  // External undo/redo must refresh the field. Equivalent numeric updates keep
  // the raw text so a trailing decimal point can become a fractional number.
  if (!Object.is(input.value, value)) setInput({ value, raw: Object.is(parse(input.raw), value) ? input.raw : String(value) })
  return <TextField label={label} value={input.raw} onChange={(raw) => {
    const next = parse(raw)
    setInput({ value: next, raw })
    onChange(next)
  }} />
}

export function TableFields({ block, onChange }: { block: Extract<ReportBlock, { kind: "data-table" }>; onChange: (value: typeof block) => void }) {
  return <div className="grid min-w-0 gap-4">
    <TextField label="Table title" value={block.title} onChange={(title) => onChange({ ...block, title })} />
    {block.columns.map((column, index) => <div key={index} className="grid gap-2 rounded-xl border border-border p-3">
      <TextField label={`Column ${index + 1} heading`} value={column} onChange={(value) => onChange({ ...block, columns: block.columns.map((entry, position) => position === index ? value : entry) })} />
      <Button type="button" variant="outline" className="min-h-11 justify-self-start" disabled={block.columns.length <= 1} onClick={() => onChange({ ...block, columns: block.columns.filter((_, position) => position !== index), rows: block.rows.map((row) => row.filter((_, position) => position !== index)) })}>Remove column {index + 1}</Button>
    </div>)}
    <Button type="button" variant="outline" className="min-h-11 justify-self-start" onClick={() => onChange({ ...block, columns: [...block.columns, "New column"], rows: block.rows.map((row) => [...row, ""]) })}>Add table column</Button>
    {block.rows.map((row, rowIndex) => <fieldset key={rowIndex} className="grid min-w-0 gap-3 rounded-xl border border-border p-3">
      <legend className="px-1 text-sm font-semibold">Table row {rowIndex + 1}</legend>
      {block.columns.map((column, index) => <TextField key={index} label={`Table row ${rowIndex + 1}, ${column || `column ${index + 1}`}`} value={row[index] ?? ""}
        onChange={(value) => onChange({ ...block, rows: block.rows.map((entry, position) => position === rowIndex ? entry.map((cell, cellIndex) => cellIndex === index ? value : cell) : entry) })} />)}
      <Button type="button" variant="outline" className="min-h-11 justify-self-start" onClick={() => onChange({ ...block, rows: block.rows.filter((_, position) => position !== rowIndex) })}>Remove table row {rowIndex + 1}</Button>
    </fieldset>)}
    <Button type="button" variant="outline" className="min-h-11 justify-self-start" onClick={() => onChange({ ...block, rows: [...block.rows, block.columns.map(() => "")] })}>Add table row</Button>
    <TextField label="Table provenance" value={block.provenance} multiline onChange={(provenance) => onChange({ ...block, provenance })} />
  </div>
}
