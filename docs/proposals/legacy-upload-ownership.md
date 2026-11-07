# Pending legacy upload ownership gate

Last updated: 2026-11-07. Confirmed by source inspection only. No request, exploit,
test, database, storage or provider operation was executed for this finding.
This is a prerequisite before production/phase-B acceptance, not a change to the
separate 85-case packet or its evidence.

## Reachable collision

[Signup](../../app/actions/auth.ts) accepts a nonempty team name.
[Registration](../../lib/repository.ts) checks email uniqueness, then
[legacy createUser](../../lib/legacy-operations.ts) assigns distinct team IDs but
stores `slugify(teamName)` without checking team-slug collisions. These teams are
inside `legacy_repository_state`; the canonical SQL `teams.slug` unique constraint
does not govern that JSON collection. Workspace-slug collision handling is a
different path.

[slugify](../../lib/utils.ts) lowercases, replaces punctuation and truncates to
64 characters. For example, two names with the same 64-letter ASCII prefix and
different suffixes receive the same stored slug. Even equal short team names
with different user emails can create distinct teams with equal slugs. The
reachable condition is equal normalized namespaces, not necessarily two distinct
stored strings longer than 64 characters.

[Uploads](../../app/api/uploads/route.ts) without a deck ID use
`uploads/<teamSlug>/library/<random-file>`. The
[writer](../../lib/storage.ts) applies slugify to that namespace again; hosted
objects add the common `legacy-slides/` prefix. No immutable owner ID is encoded.

If a second team's member **knows an existing private library key** under the
colliding namespace, [addDeckAssetAction](../../app/actions/decks.ts) accepts that
key and its exact `/files/<key>` URL. Legacy addAsset checks the caller's own deck
ownership but does not verify who uploaded the object. The
[file gate](../../lib/legacy-file-access.ts) consequently accepts the actor's
fresh session, own-team registered metadata and colliding normalized namespace.
The privileged reader then addresses the same physical object. Explicitly
publishing that attachment can also pass the
[snapshot filter](../../lib/legacy-public-assets.ts). Random filenames impede
discovery; they do not establish ownership. Key discovery was not demonstrated.

## Small next scope

Make upload ownership depend on a stable, non-lossy team identity and
server-created ownership evidence, rather than caller registration alone.
Registration must prevent duplicate effective storage namespaces. Existing
ambiguous namespaces must fail closed or require explicit ownership reconciliation;
do not rename, overwrite or delete existing objects automatically.

Author a focused regression with two real legacy teams sharing a normalized
slug, a victim library object, and an actor's attempted own-deck registration.
Both private read and publication must refuse that foreign key while valid
same-team attachments still work. Preserve the mixed-case ID compatibility fix
and source-original restrictions. Any later runtime result needs its own source
and receipt; private Storage API/RLS checks do not by themselves cover this
application authorization seam.

## Implementation candidate

The candidate now allocates unique physical team namespaces during signup,
validates internal key/URL ownership on asset registration, and refuses file
access or internal public snapshots for historical ambiguous namespaces. Exact
duplicate team slugs also refuse public page lookup. Existing rows, object keys,
display names and unambiguous URLs are not rewritten.

Four authored cases exercise the actual legacy business operations and metadata
gate; only artifact writes are mocked. They cover duplicate/long names, known
foreign references, historical ambiguity and valid existing ownership. They are
selected for retry 2, **not yet passed**. A real cross-team object/HTTP browser
probe and hosted acceptance remain separate gates.
