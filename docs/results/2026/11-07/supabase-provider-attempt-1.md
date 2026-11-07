# Supabase provider attempt 1 — failed before service setup

This attempt is **failed**. All **85 selected test identities were unrun**; there
is no provider, Storage, Auth, RLS, browser or hosted acceptance from this job.

- [Run 42321515860](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/42321515860),
  [job 128246938738](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/42321515860/job/128246938738).
  Actual job interval **00:59:39–01:00:43 UTC**, 7 November 2026, conclusion
  `failure`.
- Checked source `5babe6dc068669a1f5d970cb22b9d0953d4ae818`; activation
  `129ca0b1a721bc8b6c94fff2bfd050ec8e4c4602`.
- The unique actual `IV_SUPABASE_PROVIDER_RESULT=` JSON is preserved in
  [the receipt](supabase-provider-attempt-1.json), followed by one newline:
  **188,095 bytes**, SHA256
  `a99c0f71ff7dd1c5df2cd06e1cab1485f58fbdd54e249480db5ab1f9c98944b6`.
  The marker JSON itself was 188,094 bytes, SHA256
  `a39d65f119d7da27c0ec079a079ba0e1350bf2ad01a39b4684662734b020fb04`.

## Actual stopping condition

Node version and frozen-lock `npm ci --ignore-scripts` completed. Focused ESLint
passed. The focused semantic TypeScript check exited **2** with two `TS2345`
errors: `Buffer<ArrayBufferLike>` was not assignable to `BodyInit` in
`app/files/[...segments]/route.ts:61` and
`app/published/[publicId]/[versionId]/route.ts:41`.

No Supabase CLI download/start, migration application, bucket provision or Vitest
invocation occurred. The failure is retained before any source correction. The
provider and Storage factory activation gates remain closed.

## Independent receipt checks

All **10 retained sanitized gzip captures**, totaling **777 bytes**, were decoded
and checked against their sanitized byte lengths and SHA256 values. Their
descriptors separately record observed-original counts/hashes and explicitly say
`originalRetained:false`. Secret-bearing originals were not archived; this audit
does **not** claim independent reconstruction of those original streams. No
retained capture contains a recognizable JWT or Supabase key token.

There were **5 commands**: four exited zero and TypeScript exited two. Every command
reports observed exit/reaping, both pipe EOFs and original process-group absence,
without timeout, TERM, KILL or forced drain. The final disposable PostgreSQL fixture
audit found no `iv_check_` database residue.

All **4 reached full source guards** match **597 inputs / 11,115,484 bytes**:
before, after install, after stack stop/absence, and after cleanup. Their vector
SHA256 is `cb1a882289c459353fe269634bab78a08a0ea8ba020b74fc17ba1ad1256c1fc6`.
The after-checks guard was not reached. Every recorded source path, mode, byte
length, SHA256 and Git blob was independently matched to the immutable checked
commit. All **295 exported inputs / 2,268,243 bytes** match their recorded source
rows, and the runner's final export-equality guard passed.

All **4 positively attributed process identities** were gone; no uncertain or
remaining identities, extra signals or residual process groups were reported.
Ports 54321/54322 were available and no Supabase stack had been started. Owned
scratch identity/removal passed. The workflow's own PostgreSQL service-container
teardown step completed successfully; this does not imply a Supabase stack was
started or exercised.

## Workflow state

Only temporary workflow **409949302** was disabled through the supported GitHub
Actions endpoint. A fresh read returned **`disabled_manually`**, updated
**01:01:31 UTC**. Branch retirement and commits are separate owner actions and
were not performed by this audit. There was no retry, local runtime execution or
factory activation.

Owner follow-up: the QA branch was retired at
`4a456fd43282cbe635375d136344244afdd46985`, with the exact tree of receipt
commit `533da8ee352c47ce322f755e9951a46c227ab84d`. Remote ref readback confirmed
that retirement, and the active temporary workflow is absent from its tree.
The two response bodies were then changed to copied `Uint8Array` values for the
web response API. That correction does not change this failed verdict or run
the selected tests; a fresh source must pass the focused checks.
