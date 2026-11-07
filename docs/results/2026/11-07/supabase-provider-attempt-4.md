# Supabase provider attempt 4 — two contract failures

This attempt is **failed**: **40 passed, 2 failed, 48 unrun** out of 90 selected
identities. There is no complete provider or application-factory acceptance.
The application helper and both factory selectors remain inactive.

- [Run 42325420211](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/42325420211),
  [job 128259448947](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/42325420211/job/128259448947).
  Actual job interval **01:41:33–01:44:04 UTC**, 7 November 2026, conclusion
  `failure`.
- Checked source `63a74b393063a5addfc412f14a75474ffcfa5372`; activation
  `01045c73e4795ee0e32856b6f4e59eda96ef88da`.
- The unique actual `IV_SUPABASE_PROVIDER_RESULT=` JSON is preserved in
  [the receipt](supabase-provider-attempt-4.json), followed by one newline:
  **317,657 bytes**, SHA256
  `358576029ce7ec2a29dfd082e5ec2cea6ecae341a21635da4ff7b593ca08d035`.
  The marker JSON was 317,656 bytes, SHA256
  `7115664d6675ca4e193edc278e73ee656778bcc59dbbded0f9565aaad3183ce1`.

## Actual stopping condition

Scoped installation, lint and semantic TypeScript checking passed, as did actual
disposable CLI stack setup, migration, runtime login and private bucket setup.
All 28 affected local PostgreSQL cases passed. The Supabase shared-contract file
then reported **12 passed and 2 failed**:

1. Portable backup restore reached `checkPortableDatabase` and failed its parity
   check at `packages/provider-postgres/portable.ts:242`, called by test line 336.
2. The privileged/SET ROLE rejection case stopped during its setup at test line
   356: `SET LOCAL ROLE iv_runtime` itself was denied. The observed administrative
   owner membership deliberately has `SET false`; this receipt retains the test
   failure and does not reinterpret the permission denial as a passed identity.

The new owner-admin-only compatibility/untrusted-grant case and the actual legacy
Slides/private Storage case passed. The controller retained all five actual
Vitest JSON reports before stopping. The eight native Storage/Auth cases and
40 focused unit cases were not invoked. No cause for the portable parity failure
is established here. These adapter fixtures use internal real-loopback database
injection and a fixed HTTPS-to-loopback Storage transport mapping, with actual
services. Hosted TLS, pooler, Vercel, real application-factory/browser
and native application Auth proof remain outside this packet.

## Independent evidence checks

All **105 sanitized gzip captures / 71,269 bytes** were decoded and verified:
100 command streams and five Vitest JSON bodies. Parsed JSON reports match their
retained captures; all **42 executed identities** exactly match the immutable
source-derived names, with 40 passed, two failed and zero skips/todos. Original
observed byte counts and digests are separate metadata: secret-bearing originals
were not archived and cannot be independently reconstructed. No retained capture
contains a recognizable JWT or Supabase key token.

There were **50 commands**, 49 exiting zero and the Supabase Vitest command exiting
one. Every command reports exit observation/reaping, both pipe EOFs and original
process-group absence, without timeout, TERM, KILL or forced drain.

All **4 reached full source guards** match **606 inputs / 11,939,084 bytes**,
vector SHA256
`f6f493b9184df3844e4e5e7fa8461d5ed6c5553daa13641db580bd3b8d22f86d`.
Every recorded path, mode, Git blob, byte length and SHA256 was independently
matched to the immutable checked commit. The **296 exported inputs / 2,280,236
bytes** match source records, and final export equality passed. The guard after
all focused checks was not reached.

Of the prior attempt's 296 runtime inputs, **294 remain byte-identical**. Only
`packages/provider-supabase/schema.ts` and
`tests/providers/supabase-contracts.test.ts` changed, for the observed owner-grant
correction and its new real-service negative case. The migration and template
remain 12,758 bytes, SHA256
`73cde35f8ac0f265b1cda968fe1b4b91620ada03b4bab71d41c154c8d02fea43`.
All three preceding nonacceptance receipts remain exact and `passed:false`:
[attempt 1](supabase-provider-attempt-1.json),
[attempt 2](supabase-provider-attempt-2.json), and
[diagnostic 3](supabase-provider-diagnostic-3.json). Diagnostic completion is not
provider acceptance. No earlier cases were carried into this fresh invocation.

## Cleanup and workflow state

All **67 positively attributed process identities** were gone; zero uncertain or
remaining identities, residual groups or cleanup signals were recorded. Normal
stop removed the owned stack's five containers, one network and two volumes.
Ports were released, the local fixture database audit was empty, and owned
scratch identity/removal passed. The workflow's separate PostgreSQL service
container teardown also completed successfully.

Only temporary workflow **409972111** was disabled. A fresh GitHub read returned
`disabled_manually`, updated **01:45:03 UTC**. This audit performed no retry,
branch retirement, commit, factory activation or local product runtime.

Root follow-up: QA4 was retired at
`8eaa419cd04c9c2e5e7e9c081c95bdd8d762272e`, with the exact canonical
`62f5cde` tree and no active temporary workflow. GitHub ref readback confirmed
that retirement. The failed JSON receipt remains unchanged.
