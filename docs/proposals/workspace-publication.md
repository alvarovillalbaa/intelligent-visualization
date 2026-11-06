# Workspace Course and Report publication

Last updated: 2026-11-06

Status: local implementation prepared; its focused acceptance is pending and is
separate from the private-draft packet. Alvaro's standing "I approve everything / Keep going / Do
all the work" covers necessary focused implementation and verification. This
proposal does not request another approval or authorize paid services.

## Current boundary

[Private draft saving and reopening](../results/2026/11-06/workspace-drafts-checks.md)
are separate from publication. The [saved editor](../../components/visualizations/saved-draft-editor.tsx)
keeps the working document separate from a published snapshot. Its new publication
panel requires explicit saved-revision confirmation and an actual acknowledgement.
HTML downloads still contain the local edits shown in that tab; downloading is
separate from publishing.

[Slides publishing](../../app/actions/decks.ts) uses the
[legacy repository](../../lib/legacy-operations.ts), `.slides-storage` and the
existing `/d/`, `/embed/` and `/published/` readers. Preserve those flows.
Canonical [version contracts](../../packages/backend-contracts/provider.ts) and
[PostgreSQL publish commands](../../packages/provider-local/adapter.ts) already
exist, as does the [Course/Report artifact compiler](../../lib/artifacts/compiler.ts).
The new named prepare/commit service adds fresh workspace authorization and
payload-bound recovery over those tables; the raw canonical commands alone are
not an application authorization boundary.

## Prerequisite and proposed flow

The local storage exclusive-creation prerequisite is
[accepted separately](../results/2026/11-06/immutable-storage-checks.md).
Publication must not accept partial or overwriteable objects
as immutable artifacts. Its focused evidence must establish exclusive creation;
the publication service must separately reconcile the bytes and commit state of
a same-intent retry before relying on it.

The smallest useful flow is explicit **Publish saved revision** from a persisted
Course or Report. Require applying and saving local changes first; publication must
not silently save or expose them. Explain before the action that the selected
saved content becomes readable by anyone with its public link. Keep working
draft changes separate from the last published snapshot.

The server must recheck the current legacy session, expiry, workspace ownership
and matching admin/editor membership through the existing
[workspace draft bridge](../../packages/provider-local/workspace-drafts.ts),
including every retry. Viewers cannot publish. Bind a stable request UUID and
version UUID to the actor, workspace, target, expected revision and normalized
publication payload. Commit the immutable version record and live pointer
atomically after verifying the compiled artifact. A stale revision must preserve
the existing publication and local edits.

Retries must return the original payload-bound receipt alongside current state,
without republishing newer content or treating an old acknowledgement as the
latest live pointer. Keep uncertain intent and object identity for reconciliation;
do not blindly create another version or delete an object whose commit/reference
status is uncertain. Filesystem writes and the PostgreSQL transaction are separate
failure boundaries. Uncommitted artifacts must remain inaccessible publicly.

## Canonical reader and artifact constraints

The candidate adds separate `/v/{publicId}` live and immutable-version readers. Resolve a
published record and its owned published version before loading its artifact;
drafts, previews and unrelated versions are not public. Use the canonical
[storage adapter](../../lib/storage/factory.ts), whose local root is
`LOCAL_STORAGE_DIR` or `.data/storage`. Existing legacy readers use a different
root; do not point new artifacts at their URLs or bypass publication state through
the unauthenticated legacy `/files/` route. That raw reader now refuses decoded
traversal and the reserved canonical publication namespace, while retaining
ordinary legacy paths.

Keep two existing hash contracts explicit: compiler `artifactHash` hashes the
canonical JSON serialization of the HTML string, while `StoredObject.contentHash`
hashes raw bytes. Verify each against its corresponding representation; they are
not interchangeable. Bind the document snapshot, renderer, manifest and artifact
to the acknowledged version rather than regenerating an immutable URL from a
later draft or renderer.

Public-mode compiler output currently sends analytics to the legacy
[/api/events endpoint](../../app/api/events/route.ts), which does not accept the
Course completion/quiz event types or provide canonical analytics. Gate that
unsupported traffic explicitly while preserving public learner behavior, or
implement its own bounded contract. Do not silently substitute preview mode:
preview changes Course progress persistence and runtime semantics. Passwords,
embeds, reviews, experiments and analytics are not proven for Course/Report merely
because Slides supports them.

## Verification and delivery limits

Use authored data to verify both formats through real authenticated publication,
anonymous artifact reads, draft/published isolation, a later explicit version,
unchanged earlier bytes, fresh-role refusal, conflicts and uncertain retry.
Reuse closed evidence only with exact input equivalence; do not rerun closed
suites for another green count. Keep all prior failures and proof limits.

This is a local PostgreSQL/filesystem slice. Hosted configuration remains blocked
by the recorded 403 and is not retried here. Use existing free resources only;
no new account, model/inference call or paid resource is required. Local runtime
work remains blocked by the Storage Guard reserve; verification belongs in the
separately bounded disposable CI scope, not a local install/build/server/database.
