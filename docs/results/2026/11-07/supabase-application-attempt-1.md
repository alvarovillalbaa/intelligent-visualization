# Supabase application attempt 1 — failed before runtime

The application packet failed semantic TypeScript checking. All four browser identities, positive/negative connection probes, actual Next TLS observation windows and HTTPS Storage application checks were unrun. This is not application acceptance; the separately accepted 90-case provider receipt is unchanged.

- [Run 42331403215](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/42331403215), job `128278508181`: failure, 2026-11-07 02:53:19–02:54:01 UTC (42 seconds).
- Tested source: `0d9ebd2f6c4bf4d7271d91443b015ed9cfd9edcb`; activation: `93bb4dc274d57bf125e423326a51354609a1c92f`.
- [Original controller JSON](supabase-application-attempt-1.json): 188,352 bytes, SHA-256 `b72f64992213cdc3277ba52c916418d6266bd6871727545a66b3e37b24d54806` (exact emitted JSON plus one newline, saved before interpretation).
- Emitted JSON without the file newline: 188,351 bytes, SHA-256 `bf9c642975bd1539a5a980c033ad81d489a3e7763b647371f93e0b150613855e`.

## Actual failure

Four commands ran: Node version, frozen-lock dependency installation, scoped ESLint and scoped TypeScript. Their exit codes were respectively 0, 0, 0 and 2. The compiler reported these browser-fixture errors:

- `tests/e2e/supabase-application.spec.ts:176` and `:177`: `Promise<number | void>` is not assignable to `Promise<void>`.
- The same file at `:264`: `documentElement` and `body` do not exist on `CourseVisualizationDocument | ReportVisualizationDocument`.

No application browser report or connection probe was reached. No Supabase stack, local HTTPS proxy, DNS change or fixture journal was created. Successful cleanup flags for those unreached resources are not runtime proof of their behavior.

## Independent receipt audit

- All eight complete retained sanitized stdout/stderr captures decode and match their byte counts and SHA-256 values: 1,507 bytes total. Secret-bearing originals were not retained; their observed original digests cannot be independently replayed from this packet.
- All four children were reaped with both pipes at EOF and original process groups absent. No timeout, TERM, KILL or forced drain was reported.
- Three reached full source guards match all 622 tested Git leaves, modes, blobs, byte counts and SHA-256 values: 13,816,520 bytes; vector `c166638c525ff42274b4f9b1beb0074de1002e9a90f9d17f4314be6f8e93cf63`.
- The 286 exported inputs total 2,243,718 bytes and match the tested source. Export identity/unchanged checks and owned scratch removal passed. All three attributed process identities were gone, without uncertain ownership or residual escalation; the port-absence check passed.
- The [separate provider receipt](supabase-provider-attempt-8.json) remains 369,374 bytes, SHA-256 `24e75dfa95b776210d369129d2a592f231e7dca8c78741910f1ab18e5ab74441`, accepted at source `4da1844f22a332aad8bd827a026c3a806b4a308f`. Of its 297 protected inputs, 294 remain exact; only the two reviewed factory implementations and provider README differ. No provider cases executed in this attempt; there is no combined 94-case invocation.

Temporary workflow `410012263` was disabled after termination and freshly read back as `disabled_manually` at 02:55:01 UTC. No retry, commit, branch retirement, push or factory mutation was performed by this receipt task.

Application behavior, production-factory initialization and cleanup, native Next sessions, owned TLS/HTTPS transport, browser journeys and hosted deployment remain unverified by this attempt. The planned local CA/DNS fixture would itself be qualified local application proof, not real hosted Supabase TLS/pooler, Vercel or hosted Auth-mapping acceptance.
