# Course Authoring

Courses are continuous-scroll learning artifacts, not tall slide decks.

## Edit a generated Course

Choose **Edit Course** on a completed Course result. The editor keeps a separate
draft until **Apply changes**. Edit course details and learner preparation,
modules, lessons, glossary and linked references. Content and practice support
the existing six block kinds: heading, prose, callout, multiple-choice check,
free-recall check and summary list. Lists and objects can be added, removed and
reordered. Moving answer options keeps the chosen answer attached to its option;
removing that answer requires a new choice.

**Preview draft** shows the unapplied content. Cancel, Escape and backdrop close
offer Keep editing or Discard when there are changes. Invalid fields and a
rejected Apply retain the editor's content. Removing a module or lesson also
removes dependent prerequisite links in the isolated draft, with visible notice.

Apply checks that the same result and original draft are still current, merges
only that Course into the latest batch, and opens a fresh preview. Other formats,
captured inputs, original provider/model/time, theme, brand, source manifest and
assets are preserved. Stale compiled HTML is removed. The preview exposes learner
preparation, lesson dependencies, feedback and references as well as the existing
lesson/block content. Search metadata is retained separately from visible content.

In guest mode, the existing four-hour browser retention and storage warnings
apply. A failed storage replacement leaves the prior stored copy intact and the
current edited batch in memory; the preview also displays the storage notice.
Workspace mode retains Course edits in this tab. Apply is not hosted saving or
publication. The [all-format persistence proposal](proposals/all-formats-persistence.md)
remains behind its existing provider, schema and authorization gates.

After applying edits, open the completed Course preview and choose **Download
Course HTML**, then **Save Course HTML**. This exports the committed document,
including learner preparation, feedback, glossary and references. It does not
export an unapplied editor draft or publish a hosted Course. See
[Course HTML export](course-export.md).

## Validation and limits

Authoring reuses the canonical Course schema and adds client edit invariants.
Invalid content rejects as a whole rather than being silently filtered. Course
record IDs must be unique; source/asset IDs keep their separate namespaces.
Durations are positive safe integers, each module needs a lesson, dependencies
must exist without self-links/cycles, and multiple-choice answers must name a
nonblank option. Linked course references accept HTTP/HTTPS; lesson citations
remain freeform text. Unrecognized fields and non-JSON values reject.

| Authoring limit | Maximum |
| --- | --- |
| Encoded JSON | 2 MiB (2,097,152 bytes) |
| Traversal | 16 levels, 100,000 nodes, 512 entries per array |
| Modules / lessons overall | 32 / 256 |
| Blocks per lesson / overall, including practice | 512 / 4096 |
| Options per multiple-choice check | 32 |
| List, glossary and linked reference entries | 256 each |

These are client authoring bounds, not a schema/provider migration. Native
browser interaction and the production storage effect still need browser checks;
see the [focused source receipt](results/2026/10-27/course-editor.md) and
[inactive six-check browser proposal](proposals/course-editor-browser.md).

Remaining work includes additional block kinds beyond the existing six,
hosted Course saving/publication, generation/provider acceptance and progress
analytics. Learner answer state in preview is not an analytics integration.
