# Private workspace drafts

Last updated: 2026-11-06

Authenticated workspaces can save Course and Report documents using the local
PostgreSQL provider. Slides keep their existing save flow. Saving a working draft
does not publish it. The saved page separately offers
[explicit public snapshots](workspace-publication.md).

## Save and reopen

Generate a Course or Report in a workspace. Edit it and choose **Apply** to update
the document in this tab. Composer Apply opens its preview; choose **Back**, then
**Save Course** or **Save Report**. A successful save shows its revision and an
**Open saved Course/Report** link. Saved documents also appear in the workspace
list, with additional pages when needed.

On the saved page, **Edit Course/Report** opens the existing editor. **Apply**
updates this tab; **Save revision** persists those changes. Reloading or signing
in again opens the saved revision. Workspace viewers can read drafts; editors
and administrators can save. The server checks current access on every request.

## Interrupted saves and concurrent edits

A save keeps its original request and payload until its result is known. If the
connection fails, **Retry same save** retries that intent rather than creating a
second document. Keep the tab open during recovery. A newer revision saved in
another tab stops an overwrite and leaves local edits visible. **Reload saved
draft** asks before discarding local edits or an unresolved save.

An acknowledgement for older edits does not mark newer local edits as saved.
Replayed requests are authorized again and report the current saved state.
HTML downloads include the applied document shown in the tab; downloading does
not save that document to the workspace.

## Configuration and scope

`NEXT_PUBLIC_APP_URL` must be the exact root HTTP(S) address used to open the app,
without credentials, a query or a fragment. Writes compare the browser Origin
to this explicit configured origin. Missing or invalid configuration fails
closed; request and forwarded headers do not supply a fallback address.

Guest drafts retain their existing four-hour browser storage behavior. Signing
up does not automatically transfer them to a workspace. Original uploaded files,
hosted Supabase/Auth/storage/publication and the full AI/Eve integration
remain separate work. The [accepted local checks](results/2026/11-06/workspace-drafts-checks.md)
cover private saving, reopening and revision two on desktop/narrow profiles.
See the [focused scope](proposals/workspace-draft-checks.md) and
[limitations](limitations.md) for the remaining boundary.
