# Supabase application attempt 3 — failed

No browser identity was accepted: three timed out and one was skipped when the suite limit expired. Scoped lint/types and connection probes passed; one qualified Next TLS observation window was recorded. Complete application and hosted acceptance remain pending.

- [Run 42332852480](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/42332852480), job `128283070100`: failure, 2026-11-07 03:11:43–03:26:19 UTC (876 seconds).
- Tested source: `22ff1a18d6d5c81dca39ff77279dbaca0496ab4c`; activation: `f7fb7a4513e7797e809191c08882042d68de0625`.
- [Original controller JSON](supabase-application-attempt-3.json): 537,338 bytes, SHA-256 `b37fc6d143e6e8600206be36307e34e2d0d07591ca4ef48a643640f9e289d310` (exact emitted JSON plus one newline, saved before interpretation).
- Emitted JSON without the file newline: 537,337 bytes, SHA-256 `99d1beebf427900bf0b11f7fc4092d48be56ea23195817f0511fb91d860dae7d`.

## Actual browser outcomes

| Identity | Actual result / last stage | Fatal request failures |
| --- | --- | ---: |
| Course / desktop Chromium | 180-second timeout / `slides-publish-1` | 3 |
| Report / desktop Chromium | 180-second timeout / `slides-publish-1` | 5 |
| Course / narrow Chromium | 180-second timeout / `slides-publish-1` | 8 |
| Report / narrow Chromium | skipped; no boundary attachment | — |

The Playwright report records zero passed, three unexpected, one skipped and zero flaky cases. Each timed-out case has one result and retry 0. The suite and teardown reported the 720-second global limit. The final audit contains one canonical document for each of four fixture actors, and Next logs include fourth-actor action activity. The skipped result therefore does not establish that the fourth journey did no work; it has no finalized boundary or acceptance. The stage and timeout records do not identify which underlying operation caused the stall; no root cause is established here.

Each retained boundary attachment records five real-response proofs, two canonical publication observations, four snapshot observations and 13 negative checks before the Slides stage. These partial observations do not accept a complete identity or satisfy the later full-boundary checks. No attachment records completed Slides publication/password/attachment/collision coverage.

All three browser-fixture cleanup records contain `page.evaluate: Target page, context or browser has been closed`. Each records two created/closed contexts versus four required for full scope and zero pending jobs. Request-failure counts remain fatal; no cancellation waiver is granted. Browser-fixture cleanup therefore failed, even though the controller's separate resource teardown completed.

## Connection observations and independent audit

- Two fresh positive helper probes observed actual `iv_runtime` current/session roles over TLSv1.3. Fresh missing-CA, wrong-SAN and wrong-password probes observed `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, `ERR_TLS_CERT_ALTNAME_INVALID` and `28P01`. All seven controller helper invocations were reaped.
- The first ordinary capabilities GET and explicit Next-only window recorded six actual runtime sessions, all TLSv1.3, after helper closure. Continuous journey-wide TLS is not claimed. The second planned window was not reached. This uses an owned CA/DNS/TLS and HTTPS proxy fixture, not hosted Supabase or pooler endpoints.
- All 203 retained sanitized captures decode and match lengths/SHA-256: 198 foreground streams, four managed-server streams and raw Playwright JSON, 213,468 bytes total. The raw Playwright JSON equals its stored report; the exact source title/profile pairs and three bounded boundary attachments are retained. Secret-bearing originals were not archived and cannot be independently replayed from their observed digests.
- All 99 foreground children were reaped with both pipes at EOF and original groups absent. Browser command 84 (zero-based) exited 1; the other 98 exited 0. No foreground supervisor timeout, TERM, KILL or forced drain occurred. Playwright's internal test/global timeouts still failed. Next and the HTTPS proxy exited 0 after separately recorded intentional stops, with outputs closed, groups absent and no KILL.
- Four reached full source guards match all 627 tested Git leaves, modes, blobs, bytes and hashes: 14,510,699 bytes; vector `45d5b78222fcedd49c7ce572834b1b93c4eeaafccbb4149a7b859da7eaa65737`. All 286 exported inputs match, totaling 2,243,902 bytes. Relative to each earlier application attempt, only the reviewed browser fixture differs; the other 285 inputs are exact.
- All 291 attributed process identities were gone without uncertain ownership or residual escalation. The telemetry child exited during bounded grace without signals; final runtime sessions were zero. Journals and DNS were restored; 400 HTTPS proxy requests were recorded with zero final active jobs/failures; Docker resources, ports and owned scratch were released, and export identity remained unchanged. These supervisor facts do not erase the browser-fixture cleanup errors.

Both earlier application JSON receipts remain byte/hash-pinned and false. The [accepted 90-case provider receipt](supabase-provider-attempt-8.json) remains separate and unchanged; zero provider cases executed here. This is not a combined 94-case invocation or complete browser/hosted Auth/Vercel acceptance.

Temporary workflow `410021530` was disabled after termination and freshly read back as `disabled_manually` at 03:28:09 UTC. No retry, source fix, commit, branch retirement, push or factory mutation was performed by this receipt task.
