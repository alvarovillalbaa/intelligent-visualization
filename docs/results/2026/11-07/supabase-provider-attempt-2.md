# Supabase provider attempt 2 — failed at schema health

This attempt is **failed**. The 28 affected local PostgreSQL regression cases
passed. All 13 Supabase provider cases failed during fixture health checking;
the remaining 48 selected cases were unrun. This is not Supabase provider,
Storage, Auth, RLS, browser or hosted acceptance. Both factory selectors remain
disabled.

- [Run 42322868042](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/42322868042),
  [job 128251280584](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/42322868042/job/128251280584).
  Actual job interval **01:13:26–01:15:32 UTC**, 7 November 2026, conclusion
  `failure`.
- Checked source `5ae8aa3c2f69ad98894375d7f212355c0117c9da`; activation
  `bc1a952335fc0afb025d0c2d73eb6411090f6aa1`.
- The unique actual `IV_SUPABASE_PROVIDER_RESULT=` JSON is preserved in
  [the receipt](supabase-provider-attempt-2.json), followed by one newline:
  **323,072 bytes**, SHA256
  `dd03c3c755b7a1f1b62fe62366596b447ee0632e8db306053c58c9bd87c651ae`.
  The marker JSON itself was 323,071 bytes, SHA256
  `2eb5c3035f1821e0c4f1860c72dcad3f338ed1980a90ae376c3b107da84b8beb`.

## Actual outcome

Frozen-lock installation, scoped ESLint and semantic TypeScript checks passed.
The pinned CLI started the disposable local stack; migration, restricted runtime
login provisioning and private bucket creation completed. The four local
regression files passed **3 + 11 + 8 + 6 = 28** cases.

Every case in `supabase-contracts.test.ts` then failed in
`createSupabaseFixture → provider.health → ensureSupabaseDatabase`, with the safe
schema/runtime-policy error at `packages/provider-supabase/schema.ts:81`. That
catch replaces errors from the internal validator, so this receipt does not
identify the failing predicate or establish its cause. No Supabase business
contract passed. The eight native Storage/Auth cases and 40 focused unit cases
were not invoked. The controller retained the failed Vitest JSON before stopping.

The five actual Vitest reports contain exactly **41 unique source-derived
identities**, with 28 passed, 13 failed, no skipped or todo cases. Their retained
JSON bodies match the parsed report objects and immutable source identities.
The original [first failure](supabase-provider-attempt-1.json) remains byte exact:
188,095 bytes, SHA256
`a99c0f71ff7dd1c5df2cd06e1cab1485f58fbdd54e249480db5ab1f9c98944b6`,
`passed:false`, zero executed tests. No prior passing cases were carried here.

## Independent receipt and cleanup checks

All **105 retained sanitized gzip captures / 79,642 bytes** were decoded and
verified against their sanitized byte lengths and SHA256 values: 100 command
streams and five Vitest JSON captures. Separately observed original counts and
hashes remain metadata; `originalRetained:false` means secret-bearing originals
cannot be independently reconstructed from this packet. No retained capture
contains a recognizable JWT or Supabase key token.

There were **50 commands**: 49 exited zero and the Supabase Vitest command exited
one. All report observed exit/reaping, both pipe EOFs, original process-group
absence, and no timeout, TERM, KILL or forced drain.

All **4 reached full source guards** match **602 inputs / 11,333,273 bytes**,
vector SHA256
`f4083f20b6ad48a856aaf0512abb63a9fa6aa2f719248dfa8c5f4b1fb6200d4d`.
Every recorded path, mode, Git blob, length and SHA256 was independently matched
to the immutable checked commit. All **296 exported inputs / 2,278,057 bytes**
match the corresponding source rows, and export equality passed. The guard after
all focused checks was not reached.

All **61 positively attributed process identities** were gone, with zero
remaining or uncertain identities, residual groups or cleanup signals. The
owned stack's five containers, one network and two volumes were absent after
normal stop; ports were released, the local regression fixture audit found no
database residue, and owned scratch identity/removal passed. The workflow's
separate PostgreSQL service-container teardown step also completed successfully.

Only temporary workflow **409956725** was disabled. Fresh GitHub readback reports
`disabled_manually`, updated **01:16:12 UTC**. This audit performed no rerun,
branch retirement, commit, local runtime execution or factory activation.

Owner follow-up: the QA branch was retired at
`4beea3bb7972c4f8ffb2514db542ae2e51148c22`, with the exact tree of receipt
commit `d0e5a1284e72ef3379e282fcecd64c9f26bf5185`. Remote ref readback confirmed
retirement, and the active temporary workflow is absent from that tree. The
failure and its 28/13/48 outcome remain unchanged. The next packet collects
catalog metadata only, with zero test invocations and no provider acceptance.
