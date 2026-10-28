# Source intake

Last updated: 2026-10-28

Enter text or a link in the single-line **Text or link** input. Choose **Add** or press Enter to put that source in the list below. Each text source can be removed separately. Repeated inputs are retained as separate sources. Continue includes any text still in the input.

Pasting multiline text keeps the whole paste together with its line breaks. If it replaces a selection, text before and after that selection remains part of the same source. Attach files, drop files, and paste-file handling continue to use the existing import flow.

Guest drafts retain sources in the current browser for the existing four-hour expiry. Older multiline drafts restore as one complete source. New drafts retain entry boundaries and pending input; if storage space is tight, the app first drops this duplicate metadata while retaining canonical text and full files. Restoring that smaller draft can merge the displayed text entries into one source. Only if it still does not fit does the existing file-content compaction apply. Browser storage availability still determines whether a guest draft can persist.

After Continue, the page introduction is hidden. Select any combination of Slides, Course, and Report, then create the selected drafts from the same captured sources and style. Each result can be previewed separately. A failed format can be retried without regenerating successful results. See [AI generation](ai-generation.md) for request, recovery, and saving behavior.

URL extraction belongs to its individual request. Replacing the URL, continuing
without a URL, starting over or leaving the composer invalidates pending work;
an older response cannot replace the current style or extracted source text,
even when the same URL is selected again. The existing 15-second timeout makes
the current extraction unavailable, and a late success cannot revive it.
Continuing with an unchanged URL retains its existing style choice. These
client guards do not guarantee cancellation of server/provider work. See the
[extraction receipt](results/2026/10-28/composer-extraction.md) for checked scope.

Once a batch exists, quota compaction retains every result and the full captured retry input. It may omit duplicate entry metadata and file previews, but does not clip batch source files. If the complete batch cannot fit, the previous stored copy remains and a notice explains that the current work is only in this tab. Hosted provider and generation readiness remain described in [limitations](limitations.md).
