# Report CSV import

Open **Edit Report** on a completed Report and choose **CSV file** under
**Import table from CSV**. The file is read in this tab. Review every heading
and cell, the data-row count and the parsed-data SHA-256 before choosing
**Add table and source snapshot**. The first record supplies headings by
default; turn off **First row contains column headings** to use positional
headings and keep every record as data.

Preparing or replacing a file does not save it or change the Report. Add creates
one table, one source metadata record and a full-width placement below existing
blocks in each layout. These changes form one Undo/Redo step. **Apply changes**
commits the edited Report through the existing guarded draft path. Pending
position fields must be applied or discarded before Add. Pending CSV work must
be added or canceled before Preview or Apply; closing offers the existing
Keep editing/Discard choice.

## Text and limits

The reader accepts UTF-8 CSV with comma delimiters, doubled quotes inside quoted
fields and CRLF, LF or CR record endings. Quoted newlines remain literal. It
consumes one leading UTF-8 BOM. It preserves spaces, blank and duplicate
headings, empty cells, leading zeros, formula-like text and HTML-like text as
strings. It does not infer numbers, dates or formulas, fetch source URLs or
call a model. The preview renders text rather than markup. Positional accessible
headings distinguish blank or duplicate headings without renaming the data.

| Input bound | Maximum |
| --- | --- |
| Original file | 2 MiB (2,097,152 bytes) |
| Columns | 32 |
| Data rows | 256, excluding the optional heading record |
| Source label | 255 characters, nonblank |
| File read, parse and hash wait | 30 seconds |

Empty/BOM-only files, invalid UTF-8, NUL characters, malformed quotes, ragged
records and exceeded limits reject the entire import. No rows are truncated or
repaired. A final record separator does not invent a row; interior blank records
remain data and must match the table width. A header-only file has zero data
rows. The complete Report still has its existing 2 MiB JSON, block and layout
limits, so a file within its own budget can still be too large to add.

Replacing a file, changing header mode, canceling or leaving the editor revokes
the previous read. Late read/hash results cannot replace the current review.
Read, hash or Add errors retain the current file/review for correction or
cancellation. Browser behavior remains subject to the separately proposed
[focused checks](proposals/report-csv-import-checks.md).

## Source fingerprints and retention

SHA-256 is calculated over UTF-8 JSON with exactly the ordered keys
`{"columns": [...], "rows": [...]}`. Equivalent CSV quoting, BOM or record
endings outside quoted cells can yield the same parsed table and hash. Embedded
cell newlines and all literal cell text remain significant. The hash excludes
the file name and original file bytes; it is not proof of source accuracy.

The new source record contains its own ID, original label, row count, hash and
qualification. The table's provenance references that record and hash. Editing
the table does not rewrite the original source record. Apply requires every
pre-existing source record to remain an exact ordered prefix, then appends the
new qualified records. Legacy opaque hashes remain valid when unchanged.

This is a metadata fingerprint record, not an archived CSV or a separately
stored immutable table. Keep the original CSV. Imported table cells become part
of the Report and its later exports. Source inputs, source manifest, assets,
theme/brand and generation metadata remain unchanged; an edited Report keeps
the latest sibling Course/Slides results and drops stale artifact HTML.

Guest retention remains the existing four hours in browser storage. Workspace
drafts remain in this tab. Storage failure preserves the last stored bytes and
shows the existing notice while retaining the current Report in memory. This
feature does not add hosted persistence, a new provider, schema, account or
original-file upload. Explicit HTML export sends the committed document,
including its table, through the existing compiler boundary.

The reader follows a deliberately bounded profile of the
[RFC 4180 quoting rules](https://www.rfc-editor.org/rfc/rfc4180) with the stated
UTF-8/line-ending extensions. Fatal decoding and leading-BOM behavior follow
the [TextDecoder interface](https://encoding.spec.whatwg.org/#interface-textdecoder).
No general CSV interoperability or live browser acceptance is claimed from
source inspection alone.
