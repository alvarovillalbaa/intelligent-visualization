# PostgreSQL provider extraction source comparison

Reviewed 7 November 2026 against the accepted local implementation at
`736573142a26d2f11a9b2e6de5fc564ae894ab7c`. This records static source
equivalence, not runtime or hosted acceptance.

The old `packages/provider-local/` implementations were compared with the new
`packages/provider-postgres/` implementations. The allowlist was limited to
imports/types, local-to-shared class/factory names, trusted schema qualification,
injected database/context and initialization calls, schema arguments to projection
helpers, generic connection error labels/savepoint prefix, and trailing whitespace.
The local wrappers preserve the previous public signatures.

The following compared boundaries matched:

- Adapter `users = {` through the public repositories and registration commands
  (27,306 normalized bytes), private command helpers (2,317 bytes), and all mappers
  and validators from `function now()` onward (10,506 bytes).
- The entire draft implementation from `const COMMAND` onward (13,733 bytes) and
  publication/unpublication implementation from `const COMMAND` onward
  (25,333 bytes), after the explicit mechanical context/schema substitutions.
- Ordered SQL template vectors: 57 adapter, 13 draft and 16 publication templates.
  SQL bodies, placeholders, ordering and arguments retain their previous behavior;
  schema identifiers are selected from the two trusted constants.
- Draft authorization/normalization/cursors, publication binding/receipt/artifact
  guards, legacy state decoding, and portable canonicalization/session scrubbing.
- The transaction body retains the per-database `AsyncLocalStorage` client,
  outer BEGIN/COMMIT/ROLLBACK and nested savepoint algorithm. Only whitespace,
  the savepoint prefix and generic connection error labels differ.

The local URL guard (823 bytes), initializer and singleton (2,837 bytes) are exact
baseline bytes. The unchanged local migration v1 is 8,583 bytes, SHA-256
`6792bc7f3c6c53325d996965b4cc7c8f059a3e73b981b69d729672f711e0cb19`.
Its versioned schema was not rewritten.

New hosted behavior is outside that equivalence claim: strict connection/TLS
policy, read-only installed-schema/runtime-role validation (including membership
grants in either direction), private backend RLS,
empty initial legacy state, and the explicitly approved transactional restore
exception for an exact raw empty hosted legacy row. Local restore conflicts stay
unchanged. Requests perform no hosted migration or demo seed. A fresh health
validation does not replace a resolved initialization promise while another
transaction owns the one-client pool; nested repository operations continue to use
the same connection and resolved initialization context.

The fresh migration also refuses any pre-existing `iv_runtime` role: safe role
attributes alone cannot exclude explicit grants on another application's objects.
It creates a restricted NOLOGIN role, then explicit provisioning enables LOGIN
and supplies a private password. It does not adopt or revoke an existing role.
The runtime validator still requires an actual dedicated LOGIN session.

The 21 authored backend paths were frozen with vector SHA-256
`72ebe38c84943d743132aeacf7d3f89b27d8a3c484c14e876a78139d54bbd710`.
This is the original candidate vector. The later
[catalog diagnostic](supabase-provider-diagnostic-3.md) identified PostgreSQL's
automatic administrator grant to the private schema owner. Its narrow validator
correction changes `schema.ts` outside the local extraction equivalence claim;
the local core, versioned local schema and hosted migration remain unchanged.
It accepts only that owner's ADMIN-only management grant with INHERIT and SET
disabled, while unrelated grants remain refused. Fresh 90-case acceptance is
still required for the corrected candidate.
The vector is the ordered inventory sent to the coordinating agent, each entry
encoded as `path + NUL + decimal byte length + NUL + lowercase SHA-256`, joined by
LF without a final LF. It includes the shared core, local compatibility wrappers,
backend legacy contract, Supabase source/template and actual CLI-generated
`20261107002755_intelligent_visualization_hosted.sql`; it excludes other agents'
storage/application edits. Template and actual migration are byte-identical:
12,758 bytes, SHA-256
`73cde35f8ac0f265b1cda968fe1b4b91620ada03b4bab71d41c154c8d02fea43`.

The initial `git diff --check` covered tracked deltas only. A subsequent staged
check exposed five extra EOF blank lines in newly added shared files; those lines
were removed and the frozen vector above was updated. Explicit whole-file
whitespace checks and the working diff check passed after that correction. No
application imports, tests, installations, database commands or runtime checks
were executed locally. Actual
restricted-role Supabase service contracts, transaction-pooler/TLS compatibility
and hosted deployment remain pending; provider selection remains fail-closed.
