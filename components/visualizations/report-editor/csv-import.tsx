"use client"

import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { prepareReportCsvImport, REPORT_CSV_IMPORT_LIMITS, type ReportCsvImportReview } from "@/lib/client/report-csv"
import { CheckField, EditorSection } from "./fields"

interface CsvRequest {
  generation: number
  reader: FileReader
  timeout: ReturnType<typeof setTimeout>
}

export function ReportCsvImport({ onAdd, onPendingChange, disabledReason }: {
  onAdd: (review: ReportCsvImportReview) => string | null
  onPendingChange: (pending: boolean) => void
  disabledReason?: string
}) {
  const inputId = useId()
  const helpId = `${inputId}-help`
  const inputRef = useRef<HTMLInputElement>(null)
  const errorRef = useRef<HTMLDivElement>(null)
  const mounted = useRef(true)
  const generation = useRef(0)
  const active = useRef<CsvRequest | null>(null)
  const fileRef = useRef<File | null>(null)
  const reviewRef = useRef<ReportCsvImportReview | null>(null)
  const headerRef = useRef(true)
  const adding = useRef(false)
  const [file, setFile] = useState<File | null>(null)
  const [firstRowIsHeader, setFirstRowIsHeader] = useState(true)
  const [review, setReview] = useState<ReportCsvImportReview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ message: string } | null>(null)

  const revokeRequest = useCallback(() => {
    generation.current++
    const request = active.current
    active.current = null
    if (!request) return
    clearTimeout(request.timeout)
    request.reader.onload = null
    request.reader.onerror = null
    request.reader.onabort = null
    if (request.reader.readyState === FileReader.LOADING) request.reader.abort()
  }, [])

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; revokeRequest() }
  }, [revokeRequest])
  useEffect(() => { if (error) errorRef.current?.focus() }, [error])

  function owns(request: CsvRequest) {
    return mounted.current && active.current === request && request.generation === generation.current
  }

  function fail(request: CsvRequest, message: string) {
    if (!owns(request)) return
    revokeRequest()
    setBusy(false)
    setError({ message })
  }

  function read(selected: File, header: boolean) {
    revokeRequest()
    reviewRef.current = null
    setReview(null)
    setError(null)
    setBusy(false)
    if (selected.size > REPORT_CSV_IMPORT_LIMITS.bytes) {
      setError({ message: "Choose a CSV file of at most 2 MiB." })
      return
    }
    const reader = new FileReader()
    const request: CsvRequest = {
      generation: generation.current,
      reader,
      timeout: setTimeout(() => fail(request, "Reading CSV did not finish within 30 seconds. Choose the file again to retry."), 30_000),
    }
    active.current = request
    setBusy(true)
    reader.onerror = () => fail(request, "The CSV file could not be read. Choose it again to retry.")
    reader.onabort = () => fail(request, "Reading CSV was interrupted. Choose the file again to retry.")
    reader.onload = async () => {
      if (!owns(request)) return
      try {
        if (!(reader.result instanceof ArrayBuffer)) throw new Error("The CSV file could not be read.")
        const prepared = await prepareReportCsvImport(new Uint8Array(reader.result), { label: selected.name, firstRowIsHeader: header })
        if (!owns(request)) return
        revokeRequest()
        reviewRef.current = prepared
        setReview(prepared)
        setBusy(false)
      } catch (cause) {
        fail(request, cause instanceof Error ? cause.message : "The CSV file could not be prepared. Choose it again to retry.")
      }
    }
    try { reader.readAsArrayBuffer(selected) }
    catch (cause) { fail(request, cause instanceof Error ? cause.message : "The CSV file could not be read.") }
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.currentTarget.files?.[0]
    event.currentTarget.value = ""
    if (!selected) return
    fileRef.current = selected
    setFile(selected)
    onPendingChange(true)
    read(selected, headerRef.current)
  }

  function changeHeader(header: boolean) {
    headerRef.current = header
    setFirstRowIsHeader(header)
    if (fileRef.current) read(fileRef.current, header)
  }

  function cancel() {
    revokeRequest()
    fileRef.current = null
    reviewRef.current = null
    if (inputRef.current) inputRef.current.value = ""
    setFile(null)
    setReview(null)
    setBusy(false)
    setError(null)
    onPendingChange(false)
  }

  function add() {
    const prepared = reviewRef.current
    if (!prepared || active.current || adding.current || disabledReason) return
    adding.current = true
    try {
      const message = onAdd(prepared)
      if (message !== null) setError({ message })
      else cancel()
    } catch (cause) {
      setError({ message: cause instanceof Error ? cause.message : "The table could not be added. Your CSV review is still here." })
    } finally { adding.current = false }
  }

  return <EditorSection title="Import table from CSV" description="Choose a file, review its cells, then add a table and source snapshot to this draft.">
    <div className="grid min-w-0 gap-2">
      <label htmlFor={inputId} className="text-sm font-medium">CSV file</label>
      <Input ref={inputRef} id={inputId} type="file" accept=".csv,text/csv" aria-describedby={helpId} onChange={chooseFile} className="min-h-11" />
      <p id={helpId} className="text-xs leading-5 text-muted-foreground">CSV import reads the file in this tab. Up to 2 MiB, 32 columns and 256 data rows. Cells stay as text, including leading zeros and formula-like text.</p>
    </div>
    <CheckField label="First row contains column headings" checked={firstRowIsHeader} onChange={changeHeader} />
    {file ? <p className="min-w-0 break-words text-sm">Selected file: {file.name}</p> : null}
    {busy ? <p role="status" className="text-sm text-muted-foreground">Reading CSV…</p> : null}
    {error ? <div ref={errorRef} role="alert" tabIndex={-1} className="max-h-40 overflow-y-auto whitespace-pre-line break-words rounded-xl border border-destructive/40 p-3 text-sm text-destructive outline-none focus-visible:ring-2 focus-visible:ring-ring">{error.message}</div> : null}
    {review ? <div className="grid min-w-0 gap-3">
      <dl className="grid min-w-0 gap-1 text-xs text-muted-foreground">
        <div><dt className="inline font-semibold">Data rows: </dt><dd className="inline">{review.rowCount}</dd></div>
        <div><dt className="inline font-semibold">Columns: </dt><dd className="inline">{review.columns.length}</dd></div>
        <div><dt className="inline font-semibold">Heading mode: </dt><dd className="inline">{review.firstRowIsHeader ? "First row supplies headings" : "Generated column headings"}</dd></div>
        <div className="min-w-0 break-all"><dt className="font-semibold">Parsed data hash</dt><dd>{review.contentHash}</dd></div>
      </dl>
      <div role="region" aria-label="CSV table review" tabIndex={0} className="max-h-80 max-w-full min-w-0 overflow-auto overscroll-contain rounded-xl border border-border outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <table className="w-full border-collapse text-left text-xs">
          <caption className="sr-only">CSV table preview</caption>
          <thead><tr>{review.columns.map((column, index) => <th key={index} scope="col" aria-label={`Column ${index + 1}: ${column.trim() ? column : "blank heading"}`} className="min-w-24 max-w-80 border-b border-border bg-muted p-2 align-top whitespace-pre-wrap break-words">{column.trim() ? column : <span className="font-normal italic text-muted-foreground">Blank heading</span>}</th>)}</tr></thead>
          <tbody>{review.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, columnIndex) => <td key={columnIndex} className="min-w-24 max-w-80 border-b border-border p-2 align-top whitespace-pre-wrap break-words">{cell}</td>)}</tr>)}</tbody>
        </table>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">The snapshot keeps the source label, row count and hash of the original parsed columns and rows. You can edit the added table&apos;s cells while that source record stays unchanged. This hash describes parsed data rather than file bytes.</p>
      <p className="text-xs leading-5 text-muted-foreground">Added rows become part of your Report and its exports. Keep the original CSV; the Report stores a table and source fingerprint, not the original file.</p>
    </div> : null}
    {disabledReason ? <p className="text-xs leading-5 text-muted-foreground">{disabledReason}</p> : null}
    <div className="flex flex-wrap gap-2">
      <Button type="button" className="min-h-11 whitespace-normal" disabled={!review || busy || Boolean(disabledReason)} onClick={add}>Add table and source snapshot</Button>
      {file ? <Button type="button" variant="outline" className="min-h-11" onClick={cancel}>Cancel CSV import</Button> : null}
    </div>
  </EditorSection>
}
