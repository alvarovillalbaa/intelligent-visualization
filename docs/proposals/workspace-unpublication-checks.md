# Focused Course/Report unpublish checks

Prepared 6 November 2026 under Alvaro's standing approval. This packet implements
the [revocation contract](workspace-unpublication.md) after the separately accepted
[publication slice](../results/2026/11-06/workspace-publications-checks.md). The
source contains 39 new core cases and four browser identities; execution and
acceptance are pending.

## Behavior and protected state

Unpublish uses fresh cookie/session/member/workspace authorization, a strict
expected current public version and a separate request-bound operation receipt.
It atomically revokes all existing published versions, sets the record to draft
and retains its last version pointer. Working documents, revisions, immutable
version content/manifests/hashes and storage objects remain. Later publication
uses a fresh version UUID; old version URLs stay unavailable.

New prepare receipts capture original status and pointer to fence both initial
null and published-to-unpublished races. Old PREPARED receipts without status
become durable conflicts; old FINAL receipts retain their original acknowledgement
plus current-state reconciliation. Generic rollback rejects revoked targets and
the canonical workspace Course/Report namespace, preserving legacy Slides rollback.
Portable backups retain eligibility through their existing status column, not
operation receipts that exports omit.

The editor confirms revocation separately from publication. Dirty local edits do
not require a save. Save/publish/unpublish mutations are exclusive, unknown
acknowledgements retain the same retry intent and stale public versions conflict.
Status refresh, viewers, loading/error states and historical acknowledgement
availability stay explicit. New requests are refused after commit; admitted
requests, open/history pages and copied/downloaded content cannot be recalled.

## Distinct evidence boundaries

- Thirteen literal HTTP/application-service cases exercise real routing, body
  streaming, configured-origin guards, cookie-derived identity, safe private
  responses, unknown/replayed acknowledgements and resolver refusals using
  authored provider/storage boundaries. They do not establish actual database,
  filesystem retention or Next's automatic HEAD dispatch.
- Six new client protocol cases use authored responses to verify the separate
  unpublish request and strict receipt/current-state validation, body/timeout
  bounds and definite versus unknown outcomes. They do not establish UI behavior.
- Twenty new real PostgreSQL cases exercise fresh roles, scope/ownership, both formats,
  pointer/status fences, atomic revocation/receipts, retries and concurrency,
  rollback refusal/Slides compatibility and actual portable backup/restore.
  Trusted artifact metadata keeps their compiler/filesystem boundary explicit.
- Four actual browser identities cover Course/Report on desktop and 390-pixel
  narrow Chromium with mouse/keyboard. Authored private documents are created
  through the actual API; actual UI confirmation publishes two versions. Unsaved
  local edits remain private through explicit Unpublish. Anonymous live and both
  version GET/HEAD/conditional requests must return private/no-store 404. The
  private edits are saved/reopened and a fresh publication restores only the live
  link/new version. Old version URLs stay unavailable. Exact fixture-owned object
  files are observed separately to verify unchanged retained bytes. No generation,
  publication, revocation, database or artifact response is fulfilled.

Exact authored identities, counts and duplicate-free source extraction must be
frozen in the controller before activation. This first execution runs only these
new cases; it neither reruns closed publication journeys nor carries their old
passes as new execution. Any failed attempt retains its original verdict/streams.

## Runner and ownership

Use one temporary public Ubuntu 24.04 GitHub job, capped at twenty minutes, with
Node 24.21.0, PostgreSQL 17.6 and the unchanged frozen lock. The inactive workflow
template is [beside this scope](workspace-unpublication-checks.workflow.yml.example).
Root pins the reviewed immutable source before creating the owned QA branch.
Preparation/retirement use skip-actions commits; normal permanent CI stays intact.

The controller owns short temporary source/dependency/cache/server/browser/output
paths and a fresh marked database. Preserve bounded original command streams and
raw test JSON, exact status/name checks, full native/index/mode/blob/hash guards,
actual readiness and export equality. Assert EOF/reaping, original process groups,
marked database removal, port release and scratch identity/removal before success.
Unknown errors or uncertain resources fail. Temporary CI is disabled and retired
after receipt publication; a skipped normal workflow is not called a pass.

Fresh host Storage Guard measured 15.3 GiB free against 34.0 required. No local
install/build/database/server/browser is permitted. There is no paid service,
account, inference/model call, production data, hosted Supabase/Auth/RLS/storage
activation or production cutover. Existing environment403 is not retried or
bypassed. Physical touch/devices, current broad build/full-product proof, deletion,
  public passwords/embeds/reviews, original-asset delivery and full AI/Eve remain
outside this packet.
