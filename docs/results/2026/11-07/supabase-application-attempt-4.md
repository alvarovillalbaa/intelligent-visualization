# Supabase application attempt 4 — failed before Slides request

All four browser identities failed. The new Slides diagnostic stopped during preparation because its label locator matched two actual Base UI textboxes. No Slides publish request was observed; this attempt cannot establish whether the publication refresh change resolves the earlier stall.

- [Run 42335660289](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/42335660289), job `128291891674`: failure, 2026-11-07 03:48:40–03:52:25 UTC (225 seconds).
- Tested source: `15916d462e966679fd17e3a4a46c3742d590f354`; activation: `236b69084954d2cf0260ae20d1b593167da62527`.
- [Original controller JSON](supabase-application-attempt-4.json): 611,577 bytes, SHA-256 `3750fc2f07db1f6df19b454543c81af8b4ab6413035a0b0447d45083a7644acd` (exact emitted JSON plus one newline, saved before interpretation).
- Emitted JSON without the file newline: 611,576 bytes, SHA-256 `4ff8e07eaca044f01745a922bb651bbe38a9de8fda0a175f78f6dfa1e44b0766`.

## Actual browser failure and diagnostic limits

| Identity | Target workspace | Result / diagnostic phase | Fatal request failures |
| --- | --- | --- | ---: |
| Course / desktop Chromium | `hq` | failed / `prepare` | 5 |
| Report / desktop Chromium | `secondary-reports` | failed / `prepare` | 5 |
| Course / narrow Chromium | `hq` | failed / `prepare` | 4 |
| Report / narrow Chromium | `hq` | failed / `prepare` | 4 |

The actual strict-mode error states that `getByText('Publishing').locator('..').getByRole('textbox')` resolves to both the version-label input and the password input. Source review had missed the password component's textbox role. Each diagnostic contains only its `prepare` event; request, response, finished, failed and finished-resolution values are null. Listener/timer flags are false because preparation failed before those resources were installed. There is no response-finished, UI-enabled or post-publication snapshot proof for Slides.

Each case has one failed result and retry 0; there are zero passed, skipped or flaky cases. Each boundary records partial canonical observations: two publications, four snapshots and 13 negative checks. Those observations do not accept a complete identity or later Slides password/attachment/collision coverage. Request-failure counts remain fatal; no navigation-cancellation waiver is granted.

Every actual browser fixture records two created/closed contexts, zero pending jobs and no cleanup failures. Full scope still requires four contexts, so its final 2-versus-4 assertion failed. Complete resource closure of the two created contexts does not establish execution of the two unreached contexts or a full journey pass.

## Secondary workspace and transport observations

The actual seed result and final database audit both record eight users, eight teams, nine workspaces and eight decks; the final object audit retains eight original/victim proof objects. Report desktop's boundary records `secondary-reports` as its target. Its later stage implies the preceding hard primary-home-heading and target-route assertions completed; private fixture contents/home IDs are not archived. The helper binds primary `hq` separately from the same-team target and deck. Design metadata alone is explicitly not runtime acceptance, and no secondary-workspace Slides publish was attempted.

Two fresh positive helper probes observed actual `iv_runtime` current/session roles over TLS. Fresh missing-CA, wrong-SAN and wrong-password probes observed `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, `ERR_TLS_CERT_ALTNAME_INVALID` and `28P01`. The first explicit Next-only window recorded six actual TLSv1.3 runtime sessions after helper closure. The second window was unrun; continuous journey-wide TLS is not claimed. This is an owned CA/DNS/TLS and HTTPS proxy fixture, not hosted Supabase/pooler/Vercel or native hosted Auth acceptance.

## Independent receipt audit and closure

- All 203 retained sanitized captures decode and match lengths/SHA-256: 198 foreground streams, four managed-server streams and raw Playwright JSON, 260,023 bytes total. Raw Playwright JSON equals its stored report; all four bounded boundary attachments match the exact source/profile pairs. Secret-bearing originals were not archived and cannot be independently replayed from observed digests.
- All 99 foreground children were reaped with both pipes at EOF and original groups absent. Only browser command 84 (zero-based) exited 1; the other 98 exited 0. No foreground supervisor timeout, TERM, KILL or forced drain occurred. Next and the HTTPS proxy each exited 0 after separately recorded intentional stops, with outputs closed, groups absent and no KILL.
- Four reached full source guards match all 630 tested Git leaves, modes, blobs, bytes and hashes: 15,077,057 bytes; vector `a7de3a710b253b96e5557d3b320b6968036c2effe6a095b4e40ab01cea1dcc7e`. The 286 exact exported inputs total 2,253,079 bytes. Relative to each prior application receipt, only the four reviewed UI/action/helper/spec inputs differ; 282 remain exact.
- All 282 attributed process identities were gone without uncertain ownership or residual escalation. Final runtime sessions were zero; journals/DNS were restored, proxy jobs/failures were empty, Docker resources and ports released, and export/scratch identity/removal passed. No private fixture or private-key contents are retained.

All three prior application JSON receipts remain byte/hash-pinned and false. The [accepted 90-case provider receipt](supabase-provider-attempt-8.json) remains separate; 292 of its 297 inputs are exact, with only four reviewed runtime changes and one README change. Zero provider cases ran here; there is no combined 94-case pass.

Temporary workflow `410040391` was disabled after termination and freshly read back as `disabled_manually` at 03:54:01 UTC. No retry, source fix, commit, branch retirement, push or factory mutation was performed by this receipt task.
