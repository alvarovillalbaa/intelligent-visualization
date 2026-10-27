# Report Authoring

Choose **Edit Report** on a completed generated Report. Changes stay in an
isolated draft until **Apply changes**; **Preview draft** shows the unapplied
content. Cancel, Escape and backdrop dismissal offer Keep editing or Discard
when the draft has changed. Invalid content and a rejected Apply keep the fields.

## Layout and content

The DOM grid edits the existing three layouts: large (12 columns), medium
(8 columns) and small (4 columns). Each has independent placement and locks.
Rows are 40 pixels with 12-pixel gaps. Select a block from the block list, then
use the drag/resize handles or stage numeric position/size fields and choose
**Apply position and size**. Preview and the main Apply also check staged
geometry. Invalid fields remain available for correction; **Discard position
fields** keeps the current arrangement. A pointer release
commits one snapped change; cancelled gestures commit nothing. Overlapping,
out-of-bounds and constrained placements reject without moving other blocks.
Locked blocks require an explicit unlock before movement or resizing. Removal
requires unlocking that block at every breakpoint. Duplicate creates independent
block, nested tab and chart IDs and places the copy below the existing layout.

Undo and Redo retain twenty local draft snapshots. Content fields cover all
fifteen existing block kinds, including nested tab sections, chart series and
typed values, table rows/columns, citations and illustrative-value flags. Chart
column renaming is explicit so temporarily incomplete names do not discard
values. Attached-image fields refer to existing asset IDs; uploading and image
delivery remain separate work. Data-source snapshot records are read-only.

Generated Reports currently have empty layouts. Opening the editor supplies
missing placements below valid supplied entries; malformed supplied placements
leave a visible opening error with Apply disabled and the original intact.
The React preview uses the same row/grid
geometry with container-width breakpoints (768 and 1024 pixels), or the editor's
explicit breakpoint. Its block regions scroll and accept keyboard focus, so
small placements retain access to long text, chart notes and tables. Canvas
cards are cropped representations; the preview carries readable qualifications.
The document's block order remains its reading order at every breakpoint.

Apply checks batch, result, editor and original-draft ownership, then replaces
only the selected Report in the latest batch. Captured inputs, sibling formats,
original provider/model/time, theme, brand, source manifest, asset IDs and data
snapshots survive. Stale artifact HTML is removed. These guards do not implement
hosted saving or publication.

Guest edits use the existing four-hour browser retention when storage is
available. A failed replacement keeps the prior stored bytes and current edited
batch in memory; the preview displays the storage notice. Workspace edits remain
in this tab. The [all-format persistence proposal](proposals/all-formats-persistence.md)
keeps its existing authorization and provider gates.

## Validation and limits

The canonical Report schema is unchanged. Client authoring additionally rejects
unknown/non-JSON fields, duplicate block/tab/chart IDs, incomplete or overlapping
layouts, unsafe integer geometry and invalid dimensions. Each top-level block
needs exactly one placement per breakpoint. Chart series keys are unique;
series values must be numbers or null and category keys must exist. Table rows
must match their columns. Action links use HTTP/HTTPS. New image blocks require
an existing attached asset.

| Bound | Maximum |
| --- | --- |
| Encoded JSON | 2 MiB (2,097,152 bytes) |
| Traversal | 28 levels, 100,000 nodes, 512 entries per array |
| Top-level / total blocks | 128 / 512, including nested tab blocks |
| Layout height | 256 rows per breakpoint |
| Nested tab levels | Four |
| Chart series / data rows | 16 / 256 |
| Table columns / rows | 32 / 256 |

New blocks occupy six rows by default, so available layout height can bind
before the block-count cap. These are client limits, not provider/schema changes.

## Remaining work

Standalone artifact rendering still follows source order and does not apply
grid layouts; the current editor and React preview do. Hosted Report saving,
publication/export of these layouts, data import, immutable snapshot creation
and browser interaction acceptance remain separate work. Existing snapshot
records are preserved rather than created or rewritten by this editor.
See [Report rendering](report-rendering.md).
