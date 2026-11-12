# Workspace removal attempt 5

**Two corrected core cases passed; all four browser identities failed.**
[Run 43322250960](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/43322250960),
job `131545635355`, source `773036fd67960d0e33bfecae8d534f3e6c09f776`.
Scoped lint/types passed and the controller verified unchanged production inputs
against attempt 4, carrying its 32 accepted identities without rerunning them.

The two previously failed cases now pass: a direct SQL child update waits for
the real removal transaction, then observes the committed tombstone and refuses;
all 12 child insert/update/delete/retarget/truncate guards and parent/cascade
retention pass. Their default-reporter streams include actual pool close,
zero-client, ownership recheck and database-drop receipts. The direct inventory
found no fixture databases or global test roles afterward.

Every desktop/narrow-touch Course/Report browser journey failed at the final
dirty-editor alert assertion. The server returned the expected 404 and the dirty
heading remained visible; the unscoped alert locator matched both the editor's
error and Next.js's route announcer. This accepts no complete browser identity.
Scope the alert to the existing saved-editor region and rerun only those four
journeys. Product source stays unchanged. The four confirmation PNGs were created
but not retained by this success-only screenshot collector; no visual proof is
claimed from them. The next controller retains images even after failure.

[Original receipt](workspace-removals-attempt-5.json): raw 197,147 bytes, SHA-256
`4e4b099660acb581b968cacb0883fc06fbcbbe4e8ecdaebdfef68bcbe0a9a43e`.
All owned command/server groups stopped; the marked application database was
rechecked and dropped with zero clients, fixture databases and test roles. Final
tracked-source parity passed. This is not one new 34-core-case invocation.
