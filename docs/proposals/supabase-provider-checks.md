# Disposable Supabase Storage diagnostic packet

Prepared 7 November 2026. Inactive QA6 source only. Review and pin the candidate
before creating `qa/supabase-provider-20261107-6`; permanent CI and application
factory selection remain untouched. This packet does not rerun tests or accept
the provider.

QA5 at `f14d82a179277b2d742f0b79309286027c4676ca` executed all 90 cases:
88 passed and two native Storage cases failed. Preserve its
[exact failed receipt](../results/2026/11-07/supabase-provider-attempt-5.json),
366,433 bytes, SHA-256
`220187b7525e1b7eac9920a7a4471aa6425bf475889f1e5c8f4122ae59c62537`.
The immutable race loser's public error was not EEXIST; an anonymous-operation
response was 200 before the test reached its target-retention assertion. The
specific HTTP responses and side effects require observation. No duplicate-error
mapping or status-200 exception is introduced before that evidence.

## Scope and unchanged inputs

All five earlier receipts remain hash-pinned: attempts one, two, diagnostic three,
attempt four and attempt five. Their failed/nonacceptance verdicts remain intact.
All 296 QA5 exported runtime inputs must remain byte-identical, including the
Storage adapter, tests, schema and migration. The new
`scripts/supabase-storage-diagnostic.ts` is an additional observation source,
not a change to any tested input. No prior passed case is carried forward.

One public Ubuntu 24.04 job uses Node 24.21.0, the frozen package lock and
`npm ci --ignore-scripts`. Reuse the accepted pinned CLI 3.0.0 archive and its
checksum, exclusive scratch HOME/config/cache/temp directories, exact fresh
project/container/volume/network ownership, positive DB/Kong running-port checks,
single generated JSON configuration and explicit fresh migration/runtime LOGIN/
private-bucket provisioning. Five native/index/source guards and unchanged
export hashes remain mandatory. There is no separate regression PostgreSQL
service, repeated lint/type suite, test collector, Vitest, browser or build.

The standalone program checks the owned scratch nonce/identity, exact loopback
endpoints and database marker before HTTP operations. It instantiates the actual
`createSupabaseStorageAdapter`. Its fixture HTTPS origin maps only to the
already-owned local Kong HTTP endpoint; fetch receives the original init and the
original promise/response is returned unchanged. A bounded asynchronous
`Response.clone()` observer records real HTTP metadata and drains all jobs.
This transport is explicit local diagnostic context, not application factory or
TLS/hosted verification. It fabricates no response.

## Observations, not acceptance decisions

1. Two independent adapters race immutable writes with different authored bytes
   to one exclusively named fresh key. Record both outcomes/public error codes,
   each real HTTP error's bounded structural fields, and the service readback
   size/hash and which authored input it matches. Preserve the object until final
   owned cleanup; do not compensate a failed/uncertain write.
2. Create a separate private object containing an authored marker. Execute each
   anonymous request independently: GET raw, authenticated and public object
   routes; POST list; POST an unauthorized candidate write; DELETE the target.
   For every operation record method, owned path, actual status, content type,
   bounded body bytes/hash/shape, array length, permitted error fields and whether
   the response contains the own marker. Never retain a private object body.
3. Preserve the original malformed text-with-JSON-content-type write probe, then
   separately attempt a well-formed binary anonymous upload to another owned key.
   This prevents mistaking a parse rejection for an authorization decision.
   After **every** anonymous operation, service-read the target and record
   existence, size/hash and whether its bytes still match the original, before
   sending the next operation. Independently service-read the unauthorized-write
   key after that POST to observe whether it was created. No status, including
   200, is asserted or whitelisted as safe. A 200 empty array is not interpreted
   as a harmless RLS no-op without the actual per-operation retention evidence.
4. Decode only the anonymous/service JWT role labels and record whether the keys
   differ; retain no raw JWT, header or complete claim set. Error JSON may retain
   only code/error/statusCode and a short sanitized message or duplicate-database
   flag. Read at most 64 KiB per observer with actual EOF; no response-body or
   exception-message shortcut changes the caller's response.

Verify initial absence and track all four owned keys **before** any write: the
race, marker, original unauthorized-write and binary-write candidates. A collision
is refused without deleting pre-existing data. Delete only these keys in final cleanup, verify
their absence via service reads, drain clone jobs and close database clients.
Before normal CLI stop require zero Storage objects, Auth users, runtime clients
and temporary roles in the fresh owned stack. Unexpected objects are reported,
not broadly deleted.

## Receipt and lifecycle

The controller retains the Node JSON before its completion gate, including
partial observations on a failed program exit. Prefix:
`IV_SUPABASE_STORAGE_DIAGNOSTIC_RESULT`. Top-level `providerAccepted` and
`passed` are always false. Only `diagnosticComplete` can become true after the
scheduled observations, observer EOF/drain, owned-key cleanup, source/export
guards, command EOF/reaping/groups, process ownership, Docker/port and scratch
closure pass. Workflow exit zero means diagnostic collection completed; it never
means a test or provider was accepted. The program observes unsafe outcomes too;
it does not turn them into passing security assertions.

Keep the 20-minute job, 1,020-second work budget and 90-second cleanup reserve.
Normal stop uses only the positively identified fresh project with
`--no-backup`. No outside client is terminated and no unknown database/resource
is removed. Forced or uncertain cleanup fails completion.

Original stdout/stderr exists only in memory. The receipt retains observed
original byte counts/hashes and explicitly sanitized gzip bytes/hashes, using
actual parsed disposable status keys and byte-preserving JWT/key/credential-URL
substitution. These are not independently replayable original captures. Withhold
payloads after incomplete capture or missing key inventory. Retain no raw key,
config/dotenv, private body or credential-bearing browser state.

No hosted account/settings, paid resource, model, native application Auth,
production factory or deployment operation occurs. The application browser/TLS
packet remains paused behind a complete provider acceptance gate. Choose any
future mapping or test correction only after reviewing this actual response and
post-operation state evidence.
