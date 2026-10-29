# Course HTML export

Open a completed Course preview and choose **Download Course HTML**. When
preparation finishes, choose **Save Course HTML** to keep the file. The save link
is a separate user action. Apply editor changes first: export captures the
current committed document, not an unapplied editor draft.

The client checks the Course through the existing authoring validator before
cloning it and sending `{ document }` to the existing
`/api/visualizations/artifact` endpoint. The endpoint already compiles canonical
documents with `preview: true`. Export changes no displayed draft, browser
snapshot, workspace, schema, access rule or provider configuration. It returns
HTML only; a downloadable manifest is not added by this flow.

Preparation has a 30-second deadline and an 8-MiB UTF-8 response limit. Invalid
input, failed or malformed responses and timeouts expose a retry while retaining
the draft. Replacing the document, retrying or leaving preview invalidates old
work. Pending callbacks cannot install a file for another draft; replaced or
closed downloads revoke their Object URLs. Filenames use a bounded
`course-*.html` name without path or control characters.

## Standalone learner content

The separate `visualization-course-html-v2` renderer preserves:

- Title, subtitle, summary, audience, goal, mission, objectives, duration and
  learner level.
- Prerequisites, assumed knowledge, learner goals and constraints.
- Ordered modules and lessons, objectives, durations and informational lesson
  dependency links.
- All six existing content/practice block kinds, lesson feedback and summary.
- Lesson citations, glossary entries and linked references with their notes.

Supplied reference IDs link to their corresponding appendix entries. Freeform
lesson citations remain literal text. Reference links use HTTP/HTTPS; unsupported
links in a generally compiled document remain visible without an active link.
The download validator retains the stricter existing authoring invariants,
including unique IDs and valid lesson dependency relationships.

Internal HTML anchors and quiz radio groups use deterministic generated IDs,
separate from authored record IDs. Runtime data attributes retain escaped record
IDs. The v2 anchor format is intentionally different from the old Course v1
HTML; saved v1 files remain unchanged. Report v2 and Slides v1 retain their own
output/version contracts. Legacy v1 fingerprints remain recorded, and Course's
transition checks require an explicit v2 version and correct document/output
hashes rather than pretending the new HTML matches v1.

Downloaded preview-mode files embed the Course interaction script. Multiple
choice gives immediate feedback; free recall provides an input and guidance;
lesson completion is held in memory. Reload resets runtime-owned quiz feedback
and completion; native browser form-value restoration is separate. This runtime
contains no analytics beacon, persistent progress code
or external JavaScript. Ordinary non-preview compilation retains its existing
analytics/progress behavior; downloading does not enable it.

Text and reference metadata are escaped. Course theme CSS cannot close its
style element. Responsive wrapping, focus styles and print flow are included;
actual file opening, interaction, native focus/touch and physical print behavior
need their own acceptance evidence. Referenced resources and fonts are not
bundled as new assets. Source hashes and asset IDs keep their existing compiler
manifest meanings; downloading does not create or verify snapshots.

## Delivery limits

A standalone copy is distinct from hosted Course saving/publication and learner
analytics. Generation quality, hosted persistence, provider contracts and the
all-format PostgreSQL/Supabase migration retain their existing gates. This work
does not change Report's export flow or add new Course block kinds.

The [focused export proposal](proposals/course-export-browser.md) covers the
authored compiler/download checks and four native Chromium scenarios using one
disposable local server. Existing Report-export and Course-editor browser scopes
remain separate. See the [owning receipt](results/2026/10-29/course-html-export.md)
for checks actually performed and remaining proof limits.
