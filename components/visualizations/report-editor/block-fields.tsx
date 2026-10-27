"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { createReportBlock } from "@/lib/client/report-authoring"
import type { ReportBlock } from "@/packages/domain/entities"
import { ChartFields, TableFields } from "./data-fields"
import { SelectField, StringList, TextField } from "./fields"

export const REPORT_BLOCK_OPTIONS = [
  ["heading", "Heading"], ["rich-text", "Text"], ["callout", "Callout"], ["quote", "Quote"], ["divider", "Divider"],
  ["kpi", "KPI"], ["chart", "Chart"], ["data-table", "Data table"], ["tabs", "Tabs"], ["image", "Attached image"],
  ["list", "List"], ["timeline", "Timeline"], ["comparison", "Comparison"], ["source-note", "Source note"], ["cta", "Link"],
].map(([value, label]) => ({ value: value as ReportBlock["kind"], label }))

export function BlockFields({ block, assetIds, onChange, depth = 0 }: {
  block: ReportBlock; assetIds: string[]; onChange: (value: ReportBlock) => void; depth?: number
}) {
  switch (block.kind) {
    case "heading": return <div className="grid gap-4">
      <SelectField label="Heading level" value={String(block.level)} options={[1, 2, 3].map((level) => ({ value: String(level), label: `Level ${level}` }))} onChange={(level) => onChange({ ...block, level: Number(level) as 1 | 2 | 3 })} />
      <TextField label="Heading text" value={block.text} onChange={(text) => onChange({ ...block, text })} />
    </div>
    case "rich-text": return <TextField label="Text" multiline value={block.text} description="Plain text; paragraph breaks are preserved." onChange={(text) => onChange({ ...block, text })} />
    case "callout": return <div className="grid gap-4">
      <TextField label="Callout title" value={block.title} onChange={(title) => onChange({ ...block, title })} />
      <TextField label="Callout body" multiline value={block.body} onChange={(body) => onChange({ ...block, body })} />
    </div>
    case "quote": return <div className="grid gap-4">
      <TextField label="Quote" multiline value={block.quote} onChange={(quote) => onChange({ ...block, quote })} />
      <TextField label="Quote attribution" value={block.byline} onChange={(byline) => onChange({ ...block, byline })} />
    </div>
    case "divider": return <p className="text-sm text-muted-foreground">This block separates sections. Its position and size can be changed in the layout controls.</p>
    case "kpi": return <div className="grid gap-4">
      <TextField label="KPI label" value={block.label} onChange={(label) => onChange({ ...block, label })} />
      <TextField label="KPI value" value={block.value} onChange={(value) => onChange({ ...block, value })} />
      <TextField label="KPI detail" multiline value={block.detail} onChange={(detail) => onChange({ ...block, detail })} />
      <TextField label="KPI provenance" multiline value={block.provenance} onChange={(provenance) => onChange({ ...block, provenance })} />
    </div>
    case "chart": return <ChartFields chart={block.chart} onChange={(chart) => onChange({ ...block, chart })} />
    case "data-table": return <TableFields block={block} onChange={onChange} />
    case "tabs": return <div className="grid min-w-0 gap-4">
      <p className="text-xs leading-5 text-muted-foreground">Tabs keep their own ordered blocks. The report preview shows each tab section so every source and qualification remains readable.</p>
      {block.tabs.map((tab, index) => <fieldset key={tab.id} className="grid min-w-0 gap-4 rounded-xl border border-border p-3">
        <legend className="px-1 text-sm font-semibold">Tab {index + 1}</legend>
        <TextField label={`Tab ${index + 1} label`} value={tab.label} onChange={(label) => onChange({ ...block, tabs: block.tabs.map((entry) => entry.id === tab.id ? { ...entry, label } : entry) })} />
        {tab.blocks.map((child, childIndex) => <div key={child.id} className="grid min-w-0 gap-4 rounded-xl border border-border p-3">
          <p className="text-sm font-semibold">{REPORT_BLOCK_OPTIONS.find((entry) => entry.value === child.kind)?.label} {childIndex + 1}</p>
          <BlockFields block={child} depth={depth + 1} assetIds={assetIds} onChange={(value) => onChange({ ...block, tabs: block.tabs.map((entry) => entry.id === tab.id ? { ...entry, blocks: entry.blocks.map((item) => item.id === child.id ? value : item) } : entry) })} />
          <Button type="button" variant="outline" className="min-h-11 justify-self-start" onClick={() => onChange({ ...block, tabs: block.tabs.map((entry) => entry.id === tab.id ? { ...entry, blocks: entry.blocks.filter((item) => item.id !== child.id) } : entry) })}>Remove nested block {childIndex + 1}</Button>
        </div>)}
        <AddBlockControl assetIds={assetIds} allowTabs={depth < 3} label={`Add block to tab ${index + 1}`} onAdd={(kind) => {
          const child = createReportBlock(kind)
          if (child.kind === "image") child.assetId = assetIds[0]
          onChange({ ...block, tabs: block.tabs.map((entry) => entry.id === tab.id ? { ...entry, blocks: [...entry.blocks, child] } : entry) })
        }} />
        <Button type="button" variant="outline" className="min-h-11 justify-self-start" disabled={block.tabs.length <= 2} onClick={() => onChange({ ...block, tabs: block.tabs.filter((entry) => entry.id !== tab.id) })}>Remove tab {index + 1}</Button>
      </fieldset>)}
      <Button type="button" variant="outline" className="min-h-11 justify-self-start" onClick={() => onChange({ ...block, tabs: [...block.tabs, { id: crypto.randomUUID(), label: "New tab", blocks: [createReportBlock("rich-text")] }] })}>Add tab</Button>
    </div>
    case "image": return <div className="grid gap-4">
      <SelectField label="Attached image asset" value={block.assetId} options={Array.from(new Set([block.assetId, ...assetIds])).map((value) => ({ value, label: value }))} onChange={(assetId) => onChange({ ...block, assetId })} />
      <TextField label="Image alternative text" value={block.alt} onChange={(alt) => onChange({ ...block, alt })} />
      <TextField label="Image caption" value={block.caption ?? ""} onChange={(caption) => { const next = { ...block }; if (caption) next.caption = caption; else delete next.caption; onChange(next) }} />
      <p className="text-xs leading-5 text-muted-foreground">Choose an asset already attached to this report. Uploading and image delivery are separate features.</p>
    </div>
    case "list": return <StringList label="List items" values={block.items} onChange={(items) => onChange({ ...block, items })} />
    case "timeline": return <div className="grid gap-4">
      {block.items.map((item, index) => <div key={index} className="grid gap-3 rounded-xl border border-border p-3">
        <TextField label={`Milestone ${index + 1} label`} value={item.label} onChange={(label) => onChange({ ...block, items: block.items.map((entry, position) => position === index ? { ...entry, label } : entry) })} />
        <TextField label={`Milestone ${index + 1} detail`} value={item.detail} multiline onChange={(detail) => onChange({ ...block, items: block.items.map((entry, position) => position === index ? { ...entry, detail } : entry) })} />
        <Button type="button" variant="outline" className="min-h-11 justify-self-start" onClick={() => onChange({ ...block, items: block.items.filter((_, position) => position !== index) })}>Remove milestone {index + 1}</Button>
      </div>)}
      <Button type="button" variant="outline" className="min-h-11 justify-self-start" onClick={() => onChange({ ...block, items: [...block.items, { label: "New milestone", detail: "Describe the milestone." }] })}>Add milestone</Button>
    </div>
    case "comparison": return <div className="grid gap-4">
      {block.columns.map((column, index) => <div key={index} className="grid gap-3 rounded-xl border border-border p-3">
        <TextField label={`Comparison ${index + 1} label`} value={column.label} onChange={(label) => onChange({ ...block, columns: block.columns.map((entry, position) => position === index ? { ...entry, label } : entry) })} />
        <TextField label={`Comparison ${index + 1} body`} multiline value={column.body} onChange={(body) => onChange({ ...block, columns: block.columns.map((entry, position) => position === index ? { ...entry, body } : entry) })} />
        <Button type="button" variant="outline" className="min-h-11 justify-self-start" disabled={block.columns.length <= 2} onClick={() => onChange({ ...block, columns: block.columns.filter((_, position) => position !== index) })}>Remove comparison {index + 1}</Button>
      </div>)}
      <Button type="button" variant="outline" className="min-h-11 justify-self-start" onClick={() => onChange({ ...block, columns: [...block.columns, { label: "New comparison", body: "Describe this option." }] })}>Add comparison</Button>
    </div>
    case "source-note": return <TextField label="Source note" multiline value={block.text} onChange={(text) => onChange({ ...block, text })} />
    case "cta": return <div className="grid gap-4">
      <TextField label="Link label" value={block.cta.label} onChange={(label) => onChange({ ...block, cta: { ...block.cta, label } })} />
      <TextField label="Link URL" type="url" value={block.cta.href} description="Use an http:// or https:// URL." onChange={(href) => onChange({ ...block, cta: { ...block.cta, href } })} />
      <TextField label="Link helper text" value={block.cta.helperText ?? ""} onChange={(helperText) => { const next = structuredClone(block); if (helperText) next.cta.helperText = helperText; else delete next.cta.helperText; onChange(next) }} />
    </div>
  }
}

export function AddBlockControl({ assetIds, allowTabs = true, label = "Add block", onAdd }: { assetIds: string[]; allowTabs?: boolean; label?: string; onAdd: (kind: ReportBlock["kind"]) => void }) {
  const [kind, setKind] = useState<ReportBlock["kind"]>("rich-text")
  const options = REPORT_BLOCK_OPTIONS.filter((entry) => (entry.value !== "image" || assetIds.length > 0) && (entry.value !== "tabs" || allowTabs))
  return <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
    <SelectField label={`${label} type`} value={kind} options={options} onChange={setKind} />
    <Button type="button" variant="outline" className="min-h-11" onClick={() => onAdd(kind)}>{label}</Button>
  </div>
}
