# PostgreSQL attempt 2 — browser cancellation failure

Source `a5a702ea20108d3ed376fab9a181b838dd5897e0`, activation
`8d7745d7aadb231588ce91d0c84964a3d5cd7928`,
[run 42185790560](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/42185790560),
job `127785676561`. Original receipt: `postgres-attempt-2.json`.

Frozen install, scoped lint/types, all seven configuration and all 28 real
PostgreSQL identities passed. Both original Vitest JSON reports are preserved.
Fixture databases were absent after tests; explicit setup and doctor passed.

Both actual browser journeys reached their final checks but failed the request-
failure counter (desktop 16, narrow 19). No browser acceptance is inferred.
The original report and boundary attachments retain the observed cancellations.
The controller reports an empty assertion error; the ordinary Playwright report
contains the actual failure diagnostics. All other tripwire counters were zero.

All 28 command streams, original test/browser reports and both server streams
are retained. Native/exported source, stream closure, context/owned process/port,
marked database and scratch cleanup passed. The seven/28 passing identities
must not be repeated unchanged; carry them only with exact checked-input proof.
