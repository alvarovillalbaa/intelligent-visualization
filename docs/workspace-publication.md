# Publish a Course or Report

Last updated: 2026-11-07

The local candidate adds explicit public snapshots for saved Course and Report
drafts. Its [focused receipt](results/2026/11-06/workspace-publications-checks.md)
accepts forty core cases and four desktop/narrow browser journeys across three
recorded sources. Slides retain their existing publishing flow.

## Publish a saved revision

Open a saved Course or Report in its workspace. Apply editor changes, then choose
**Save revision**. In **Publication**, choose **Publish saved revision** and review
the title/revision. **Confirm publish** makes that saved content readable by anyone
with its public link. Unapplied or unsaved edits are not included.

**Open current public version** follows the live link to the latest explicitly
published snapshot. **Open immutable published version** opens that particular
version. Later edits and saves do not update either snapshot automatically.
Publish another saved revision explicitly to update the live link; the earlier
version's URL remains public and its content stays unchanged.

Workspace viewers can inspect publication status but cannot publish or unpublish.
The local candidate now adds separate [accepted Unpublish controls](workspace-unpublication.md);
deletion is not included. Public
Course/Report passwords, embeds, review/experiment flows and analytics are not
added by this slice. The public reader excludes protected or unavailable records.

## Interrupted publishing

Keep the tab open if a publication cannot be confirmed. **Retry same publication**
reconciles the original saved revision rather than creating another version.
Working edits remain visible, and saving is paused while that outcome is unknown.
If another draft revision or live publication has changed, the panel reports a
conflict and preserves the original acknowledgement separately from current state.

**Reload saved draft** asks before discarding local edits or unresolved work.
An unconfirmed publication may already be public. The acknowledged-version link
identifies the original result; it does not claim which version is live now.
HTML downloads still use the applied document shown in the tab and do not publish.

## Reader and operator scope

Course lesson completion is stored per public version when browser storage is
available. A new version starts separately; denied storage falls back to the
current page. Quiz feedback is interactive but its answer selection is not
persisted. Course/Report publication sends no legacy analytics events.

Canonical `/v/` readers serve verified committed artifacts through the canonical
storage adapter. The legacy `/files/` reader refuses the reserved canonical
publication namespace and decoded traversal; ordinary legacy media paths remain.
Staged objects are not public merely because their filesystem path exists. Failed
or uncertain publication does not delete them automatically. Back up database and
object storage separately; database exports omit pending/idempotency records.

The write origin must match the configured root `NEXT_PUBLIC_APP_URL`. This local
PostgreSQL/filesystem candidate stays separate from hosted Supabase/Auth/RLS/storage
and full AI/Eve activation. Existing hosted configuration is still pending; these
source changes do not establish a production cutover or original-asset delivery.
