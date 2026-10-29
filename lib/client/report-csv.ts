export const REPORT_CSV_IMPORT_LIMITS = Object.freeze({
  bytes: 2 * 1024 * 1024,
  columns: 32,
  dataRows: 256,
} as const)

export interface ReportCsvImportReview {
  readonly label: string
  readonly columns: readonly string[]
  readonly rows: readonly (readonly string[])[]
  readonly contentHash: string
  readonly rowCount: number
  readonly byteLength: number
  readonly firstRowIsHeader: boolean
}

const preparedImports = new WeakSet<object>()

function invalid(message: string): never { throw new Error(message) }

function parseCsv(text: string, firstRowIsHeader: boolean): string[][] {
  const records: string[][] = []
  const maximumRecords = REPORT_CSV_IMPORT_LIMITS.dataRows + (firstRowIsHeader ? 1 : 0)
  let record: string[] = [], width: number | undefined
  let state: "start" | "unquoted" | "quoted" | "closed" = "start"
  let fieldStart = 0, quotedValue = "", recordStarted = false

  const ragged = () => invalid(`CSV record ${records.length + 1} must have ${width} cells, like the first record.`)
  const finishField = (end: number) => {
    if (record.length >= REPORT_CSV_IMPORT_LIMITS.columns) invalid("CSV files can contain at most 32 columns.")
    if (width !== undefined && record.length >= width) ragged()
    record.push(state === "closed" ? quotedValue : text.slice(fieldStart, end))
  }
  const finishRecord = () => {
    if (width === undefined) width = record.length
    else if (record.length !== width) ragged()
    records.push(record)
    record = []
    recordStarted = false
  }

  for (let index = 0; index < text.length; index++) {
    if (!recordStarted) {
      if (records.length >= maximumRecords) invalid("CSV files can contain at most 256 data rows.")
      recordStarted = true
    }
    const character = text[index]
    if (state === "quoted") {
      if (character === '"') {
        if (text[index + 1] === '"') index++
        else {
          quotedValue = text.slice(fieldStart, index).replace(/""/g, '"')
          state = "closed"
        }
      }
      continue
    }

    if (character === "," || character === "\r" || character === "\n") {
      finishField(index)
      if (character === ",") {
        // A comma necessarily starts another cell, including an empty final cell.
        if (record.length >= REPORT_CSV_IMPORT_LIMITS.columns) invalid("CSV files can contain at most 32 columns.")
        if (width !== undefined && record.length >= width) ragged()
      } else {
        finishRecord()
        if (character === "\r" && text[index + 1] === "\n") index++
      }
      fieldStart = index + 1
      quotedValue = ""
      state = "start"
    } else if (character === '"') {
      if (state !== "start") invalid(`CSV record ${records.length + 1} contains a quote inside an unquoted field.`)
      state = "quoted"
      fieldStart = index + 1
    } else {
      if (state === "closed") invalid(`CSV record ${records.length + 1} has text after a closing quote. Use a comma or record separator.`)
      state = "unquoted"
    }
  }

  if (state === "quoted") invalid(`CSV record ${records.length + 1} has an unterminated quoted field.`)
  // A final separator ends its record; it does not invent another empty record.
  if (recordStarted) {
    finishField(text.length)
    finishRecord()
  }
  return records
}

export async function prepareReportCsvImport(bytes: Uint8Array, options: {
  label: string
  firstRowIsHeader: boolean
}): Promise<ReportCsvImportReview> {
  if (!(bytes instanceof Uint8Array)) invalid("CSV import expects UTF-8 bytes.")
  const byteLength = bytes.byteLength
  if (byteLength === 0) invalid("Choose a nonempty CSV file.")
  if (byteLength > REPORT_CSV_IMPORT_LIMITS.bytes) invalid("CSV files must be at most 2 MiB (2,097,152 bytes).")
  if (!options || typeof options !== "object") invalid("Choose a CSV source label and an explicit header mode.")
  // Capture options before hashing yields so caller changes cannot alter a prepared review.
  const { label, firstRowIsHeader } = options
  if (typeof label !== "string" || !label.trim() || label.length > 255) invalid("CSV source labels must contain 1–255 characters and cannot be blank.")
  if (typeof firstRowIsHeader !== "boolean") invalid("Choose explicitly whether the first CSV record contains column headings.")
  if (typeof TextDecoder === "undefined") invalid("CSV import needs UTF-8 decoding support in this browser.")

  let text: string
  try {
    // Fatal UTF-8 decoding consumes one leading UTF-8 BOM and preserves cell text.
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch { return invalid("CSV files must use valid UTF-8 encoding.") }
  if (!text.length) invalid("Choose a nonempty CSV file.")
  if (text.includes("\0")) invalid("CSV files must contain text without NUL characters.")
  const records = parseCsv(text, firstRowIsHeader)
  const columns = Object.freeze(firstRowIsHeader
    ? records[0]
    : Array.from({ length: records[0].length }, (_, index) => `Column ${index + 1}`))
  const rows = Object.freeze((firstRowIsHeader ? records.slice(1) : records).map((row) => Object.freeze(row)))

  const subtle = globalThis.crypto?.subtle
  if (!subtle || typeof subtle.digest !== "function" || typeof TextEncoder === "undefined") invalid("CSV import needs SHA-256 support in a secure browser context.")
  let contentHash: string
  try {
    // The fixed columns/rows key order matches contentHash({ columns, rows })'s canonical JSON.
    const payload = new TextEncoder().encode(JSON.stringify({ columns, rows }))
    const digest = new Uint8Array(await subtle.digest("SHA-256", payload))
    if (digest.byteLength !== 32) throw new Error("Unexpected SHA-256 result")
    contentHash = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("")
  } catch { return invalid("The CSV content fingerprint could not be created. Try preparing the file again.") }

  const review: ReportCsvImportReview = Object.freeze({
    label, columns, rows, contentHash, rowCount: rows.length, byteLength, firstRowIsHeader,
  })
  preparedImports.add(review)
  return review
}

export function requirePreparedReportCsvImport(value: unknown): ReportCsvImportReview {
  // Check identity before inspecting fields: a copied, forged or proxied review is not prepared data.
  if (!value || typeof value !== "object" || !preparedImports.has(value) || !Object.isFrozen(value)) {
    invalid("Prepare and review this CSV file again before importing it.")
  }
  return value as ReportCsvImportReview
}
