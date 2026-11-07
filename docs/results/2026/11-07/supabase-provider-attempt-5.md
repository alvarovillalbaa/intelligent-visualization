# Supabase provider attempt 5 — two native Storage failures

This attempt is **failed**. All **90 selected identities** executed once:
**88 passed and 2 failed**, with zero unrun, skipped or todo cases. Complete
provider acceptance and production-factory activation remain blocked.

- [Run 42326308074](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/42326308074),
  [job 128262292449](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/42326308074/job/128262292449).
  Actual job interval **01:52:02–01:54:51 UTC**, 7 November 2026, conclusion
  `failure`.
- Checked source `f14d82a179277b2d742f0b79309286027c4676ca`; activation
  `98c81419fb3a7cf6c9c7f293d34fe02399088db7`.
- The unique actual `IV_SUPABASE_PROVIDER_RESULT=` JSON is preserved in
  [the receipt](supabase-provider-attempt-5.json), followed by one newline:
  **366,433 bytes**, SHA256
  `220187b7525e1b7eac9920a7a4471aa6425bf475889f1e5c8f4122ae59c62537`.
  The marker JSON was 366,432 bytes, SHA256
  `f12edde23a9c8d11a10f93675eed9b7774bd69431852c7d03a95e3a15121f47d`.

## Actual outcome

Scoped static checks and actual disposable stack setup passed. The selected
order produced **28 local PostgreSQL regression passes, 40 focused unit passes,
14 Supabase provider passes, then six passes and two failures in native Storage**.
Both earlier portable-parity and administrator SET ROLE fixture expectations
passed without changing product policy or granting SET access.

The remaining failures are preserved exactly:

1. The concurrent immutable-write case had one fulfilled and one rejected writer,
   but the rejected `SupabaseStorageError` did not match expected `code:EEXIST`
   (`tests/integration/supabase-storage.test.ts:33`). Its later winning-byte and
   sequential-replacement assertions were not reached.
2. The anonymous-boundary case received HTTP 200 where a denial status was required
   (test line 79). Its list route already permits only a parsed empty-array 200.
   This failure does not record which other method/path returned 200 or its body;
   it does not establish a harmless deletion response, an exposed object, or an
   unauthorized write. The final independent marker read was not reached.

No status or error-code waiver is applied. All eleven original Vitest JSON
reports are retained before the failure gate. These adapter fixtures use a real
loopback database through the internal injected-database seam and a fixed
HTTPS-to-loopback Storage transport mapping. Production factories, verified
hosted TLS/pooler, Vercel, application browsers and native application Auth mapping
remain unverified. No historical test result was carried into this invocation.

## Independent evidence and cleanup

All **123 retained sanitized gzip captures / 94,671 bytes** were decoded and
verified against their sanitized lengths and SHA256 values: 112 command streams
and eleven Vitest JSON bodies. Parsed reports match those captured bodies. Their
90 unique literal identities independently match the immutable checked source.
Observed-original counts/hashes are separate metadata; secret-bearing originals
were not archived and cannot be independently reconstructed. No retained capture
contains a recognizable JWT or Supabase key token.

There were **56 commands**, 55 exiting zero and the native Storage Vitest command
exiting one. Every command reports exit observation/reaping, both pipe EOFs and
original process-group absence, with no timeout, TERM, KILL or forced drain.

All **4 reached full source guards** match **608 inputs / 12,264,313 bytes**,
vector SHA256
`09a6ebb0729f29986296b16ed5fd059172ace742da2a0c925e9a804367458456`.
Every path, mode, Git blob, length and SHA256 was independently checked against
the immutable source commit. The **296 exported inputs / 2,280,276 bytes** match
source records and final export equality passed. The guard after all focused
checks was not reached.

Against QA4, **295 runtime inputs remain exact**; only the Supabase test file's
two fixture corrections and honest caption changed. Schema SHA256 `3e516771…`
and migration/template SHA256 `73cde35f…` remain exact. All four earlier
nonacceptance receipts remain byte/hash pinned and `passed:false`:
[attempt 1](supabase-provider-attempt-1.json),
[attempt 2](supabase-provider-attempt-2.json),
[diagnostic 3](supabase-provider-diagnostic-3.json), and
[attempt 4](supabase-provider-attempt-4.json).

All **78 positively attributed process identities** were gone; no remaining or
uncertain identities, residual groups or cleanup signals were reported. Normal
stop removed all owned project containers, network and volumes. Ports were
released, the local regression fixture-database audit was empty, and owned
scratch identity/removal passed. The workflow's separate PostgreSQL service
container teardown also succeeded. The final cross-service residue audit after
all passing tests was not reached; full stack removal is a separate cleanup fact.

Only temporary workflow **409977437** was disabled. Fresh GitHub readback reports
`disabled_manually`, updated **01:55:34 UTC**. This audit performed no retry,
branch retirement, commit, helper execution or factory activation.

Root follow-up: QA5 was retired at
`ef289e49139a79f75a900fea2551105ab740ecc4`, with the exact canonical
`0ae67fc` tree and no active temporary workflow. GitHub ref readback confirmed
that retirement. Its failed JSON and all 90 recorded outcomes remain unchanged.
