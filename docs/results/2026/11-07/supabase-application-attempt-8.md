# Supabase application attempt 8 — failed; handler-bypass and CDP evidence retained

All four browser identities failed. Desktop Course completed its first Slides publication, then hit the original second-publication deadline without an exact matching request/response being observed. The other three cases retained exact first-publication `net::ERR_ABORTED` failures after HTTP 200 RSC headers, despite direct returned-label feedback and fresh UI/SQL/Storage observations. No complete application journey is accepted.

- [Run 42342100374](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/42342100374), job `128311817309`: failure, 2026-11-07 05:17:39–05:23:09 UTC (330 seconds), attempt 1.
- Tested source: `3635084b0b35d96d97470e2f3c103e106e583534`; activation: `fa6b08ec2375b4a5dd3329ea20ed662fd4337360`. The lock retains Playwright 1.57.0.
- [Exact controller JSON](supabase-application-attempt-8.json): 706,477 bytes, SHA-256 `17de177b639348e28a213a13bc76f245e3675aa186c1b3103ad5a1efb4b8c2f4`, saved as emitted JSON plus one newline before interpretation.
- Emitted JSON without the file newline: 706,476 bytes, SHA-256 `3a522775281d285ce16f304a24cad84c1b120b7e00e657bc8e30c4ed8757055d`.

## Control and observed outcomes

This is a URL route-handler-bypass control, not a no-CDP or fully unpaused baseline. The same eleven original method/header/body/stage predicates run passively; admitted URL methods may begin effects before passive rejection. Unknown/foreign/model URLs still have an active abort handler and an independent zero-abort acceptance gate. Recorded active unknown-URL aborts were zero in all four cases; passive request counts were 99/75/70/69. These facts do not identify the cause of previous cancellations.

| Identity | Selected publication result | Direct returned-label feedback | Post-failure snapshot duration / deadline left | Fatal request failures |
| --- | --- | --- | --- | ---: |
| Course / desktop | First finished; second exact request unproven at deadline | First observed | Second not collected | 6 |
| Report / desktop, secondary workspace | First failed/canceled | Observed 138 ms after failure | 996 ms / 8,191 ms | 6 |
| Course / narrow | First failed/canceled | Observed 139 ms after failure | 938 ms / 8,345 ms | 4 |
| Report / narrow | First failed/canceled | Observed 257 ms after failure | 1,170 ms / 7,741 ms | 3 |

For the three aborts, the new `Published <authored label>.` status follows the actual awaited ServerAction return in the tested client. Each post-failure diagnostic also observed the enabled button, one uniquely labeled article, expected title/live marker, and a fresh helper snapshot within the original shared 10-second deadline. All three snapshots retained the previous preview version and had exactly one additional version; the new current pointer, published/unprotected policy, label/source hashes, scoped artifact key and SQL HTML versus actual Storage byte/SHA metadata matched. Safe artifact extraction did not return signed queries. Snapshot HTML bodies are not archived.

That direct client acknowledgement is distinct from successful network completion: the three original `response.finished()` resolutions remain unobserved/null, the exact request failures remain primary, and the diagnostic always rethrows them. Desktop Course's second request has no selected request ID, response or feedback; its exact request binding and cause remain unproven. Full results are four failed, retry 0, zero passed/skipped/flaky. Later complete password/revisit coverage and the second Next TLS window were not reached.

## Passive CDP and actual-reader observations

The primary-page observer recorded 12 scoped editor POST rows: nine `loadingFailed` with `canceled: true` / `net::ERR_ABORTED` and three `loadingFinished`, all with response status 200. First terminal events were preserved; no extra or conflicting terminal events were recorded. All four actual selected publication requests independently have unique existing request-ID hash plus method/path/action matches. Desktop Course's first matches a finished row; the other three match failed rows. Its second publication has no exact binding.

For those three failed publications, the native-reader observations also match uniquely: 13/13/17 fulfilled reads, 124,869/124,792/124,793 decoded observed bytes, native done, and zero observed rejected/pending reads, cancellations or lock releases. Native done callbacks were recorded 0/0/4 ms before the Node failure callbacks; cross-process callback clocks do not establish causal wire ordering. CDP encoded chunk sums were 32,825/20,288/29,888 bytes and are not decoded-body byte counts. Raw RSC bytes were not archived. Desktop Course's successful first publication has no retained matching native-consumer candidate, so no consumer correlation is claimed for that control. Eight document snapshots contain 11 action observations overall.

CDP protocol timestamps remain monotonic seconds and callback timestamps epoch milliseconds. Session scope is only the primary authenticated page, not workers/other targets. All four sessions enabled and detached within the explicit budgets, with own listeners removed, zero pending command jobs/errors, no late creation and no truncated terminal metadata. Detachment does not prove requests finished; the separate React debug channel and all possible consumers are not observed. No additional body read, buffer, interception or routing command was introduced by this passive session.

The exact owned HMR grammar admitted 8/7/6/6 development sockets; refused-WebSocket counts were zero. Desktop Course recorded `view` and `slide_view` events finishing 200, but two later event requests lacked admitted event metadata and produced fatal analytics-policy violations plus failed-request diagnostics. Their event type/initiator is not established. No event/beacon/cancellation waiver was applied. See the [proposal](../../../proposals/supabase-browser-checks.md) and [source investigation](slides-response-investigation.md) for the control and source limits.

## Evidence and resource audit

- All 203 complete retained sanitized captures independently decode and match byte counts/SHA-256: 198 foreground streams, four managed-server streams and raw Playwright JSON, 311,913 bytes total. Captured Playwright JSON equals the stored report. Original secret-bearing streams were not archived; their observed counts/digests cannot be independently replayed as originals.
- All 99 foreground children were reaped with both pipes at EOF and original groups absent. Browser command 84 (zero-based) exited 1; the other 98 exited 0. No foreground timeout, TERM, KILL or forced drain occurred. Managed Next/proxy exited 0 after intentional stops, with closed outputs, absent groups and no KILL.
- Four reached full source guards match all 640 tested Git leaves, modes, blobs, bytes and SHA values: 17,734,740 bytes, vector `d7d7ac82f3f70989fce70a777876bd67cfa0cc1b06f37ae811b34d82ccc47322`. All 286 exported inputs match, totaling 2,292,471 bytes. The after-browser success guard was not reached.
- All seven previous application receipts remain exact and false, with protected input counts 281/281/281/282/282/283/284 of 286 and explicit narrow code/documentation exceptions. The [90-case provider receipt](supabase-provider-attempt-8.json) remains separately accepted, protecting 292/297 inputs; zero provider cases ran here. No combined 94-case pass is claimed.
- All 300 attributed process identities were gone without uncertain ownership or residual escalation. Runtime sessions ended at zero; journals/DNS restored, proxy active/failure counts zero, Docker resources/ports released, and export/root identity/scratch removal passed. Each case closed its two created contexts without pending jobs/errors; full scope required four contexts and remained incomplete.

Positive and missing-CA/wrong-SAN/wrong-password probes retained their expected finite results. One qualified Next-only window recorded five actual TLSv1.3 runtime sessions after helper closure. The second window was not reached; this fixture does not establish real hosted Supabase/pooler, Vercel or hosted Auth acceptance.

Temporary workflow `410085100` was disabled after termination and freshly read back as `disabled_manually` at 05:23:58 UTC. This receipt task performed no retry, source fix, commit, push, branch retirement or factory mutation.
