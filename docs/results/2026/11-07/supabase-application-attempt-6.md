# Supabase application attempt 6 — failed; reader evidence retained

All four browser identities failed on the exact first Slides publish request: HTTP 200 RSC headers followed by `net::ERR_ABORTED`. The new actual-consumer observations distinguish native reader completion from the network failure; they do not waive it or accept an application journey.

- [Run 42338448718](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/42338448718), job `128300571579`: failure, 2026-11-07 04:26:14–04:31:16 UTC (302 seconds).
- Tested source: `f7d39323af22a7eada88b4bd5bfd7d6c116b9b74`; activation: `1a2bb08db957c43dbc243f2441f1d75d0eb13de7`.
- [Original controller JSON](supabase-application-attempt-6.json): 643,901 bytes, SHA-256 `cb0171a830e112020da97c21f0a27990404f2dd9a86f93407415f18805cd8f1c` (exact emitted JSON plus one newline, saved before interpretation).
- Emitted JSON without the file newline: 643,900 bytes, SHA-256 `022051c05398733081a307726137342b9daa09aab25ccaad70e06d228a6b1524`.

## Matched consumer and network observations

Before interpreting the reader data, the audit verified each existing Next development request-ID hash has one browser consumer candidate and one selected publish, with matching method/path/action hash and exact document/consumer ordinal. No header was added or replaced. All four correlations are unique in their recorded scope.

| Identity | Fulfilled native reads | Observed bytes | Native done → Node failure callback | Fatal request failures |
| --- | ---: | ---: | ---: | ---: |
| Course / desktop | 11 | 124,749 | 0 ms | 6 |
| Report / desktop, secondary workspace | 14 | 124,760 | 1 ms | 4 |
| Course / narrow | 15 | 124,725 | 1 ms | 4 |
| Report / narrow | 15 | 124,703 | 1 ms | 4 |

Each matched response had one observed default reader, every read fulfilled, native `done` recorded, and zero pending reads, rejected reads, observed reader cancellations or lock releases. Copied-byte/hash counts agree, with no overflow or observer errors. Reported reader digests cannot be independently replayed because raw RSC chunks were not archived.

These native `done` callbacks were recorded in the same millisecond as, or one millisecond before, the Node network-failure callback. Browser/Node callback timestamps do not establish causal wire ordering. The passive snapshots recorded no observed native operation pending before fixture closure; closure started 23–27 ms after the failure callback. This distinguishes the retained observations from a snapshot taken after explicit fixture close, without identifying the abort's cause.

Native `done` is not network EOF proof, including because cancellation can produce a done result. No reader cancellation was observed through the instrumented methods, but not every possible consumer/cancellation path is claimed. React's separate debug channel was not observed. Own-method interposition also has observation overhead. The strict request-failed and `response.finished()` gates remained fatal; finished-resolution timestamps are null for all four publish diagnostics, and their own timers/listeners closed.

Eight document snapshots contain 12 observed action readers overall, with bounded metadata and no collection errors. The four complete journey results remain failed, retry 0, with zero skipped/flaky/passed. Actual created contexts closed 2/2 with no pending jobs or cleanup errors; full scope still required four contexts. Later Slides publication/password/public-navigation coverage and the second Next TLS window were not completed.

## HMR, events, transport and source limits

All refused-WebSocket and owned `/api/events` metadata arrays are empty in this attempt. The cases stopped before public Slides navigation; these empty arrays neither identify nor disprove attempt 5's HMR/event sources. No WebSocket, beacon or cancellation exemption was introduced. See the [source investigation](slides-response-investigation.md) for the pinned Next/header/reader/HMR contracts and unresolved limits.

Positive and missing-CA/wrong-SAN/wrong-password probes retained their expected finite results. The first qualified Next-only window recorded six actual TLSv1.3 runtime sessions after helper closure; continuous journey-wide TLS is not claimed. The owned CA/DNS/TLS and HTTPS proxy fixture is not real hosted Supabase/pooler, Vercel or hosted Auth acceptance.

- All 203 retained sanitized captures decode and match lengths/SHA-256: 198 foreground streams, four managed-server streams and raw Playwright JSON, 272,921 bytes total. Raw JSON equals its stored report. Secret-bearing originals were not archived and cannot be independently replayed from their observed digests.
- All 99 foreground children were reaped with both pipes at EOF and original groups absent. Only browser command 84 (zero-based) exited 1; the other 98 exited 0. No foreground supervisor timeout, TERM, KILL or forced drain occurred. Next/proxy exited 0 after separately recorded intentional stops, with outputs closed, groups absent and no KILL.
- Four reached full source guards match all 635 tested Git leaves, modes, blobs, bytes and hashes: 16,339,232 bytes, vector `41bde0044b100b60b4c2b63d65a42340d91b9f4029442ff19c129b5ddaacaf21`. All 286 exact exported inputs total 2,270,157 bytes. Earlier application guards preserve 281/286 for attempts 1–3, 283/286 for attempt 4 and 284/286 for attempt 5, with the exact README documentation exception recorded separately.
- All 285 attributed process identities were gone without uncertain ownership or residual escalation. Runtime sessions ended at zero; journals/DNS were restored, proxy activity/failures empty, Docker resources/ports released, and export/scratch identity/removal checks passed. This resource closure does not accept the failed journeys.

All five earlier application receipts remain byte/hash-pinned and false. The [accepted 90-case provider receipt](supabase-provider-attempt-8.json) remains separate; zero provider cases ran here. No combined 94-case pass is claimed.

Temporary workflow `410058958` was disabled after termination and freshly read back as `disabled_manually` at 04:33:35 UTC. No retry, source fix, commit, retirement, push or factory mutation was performed by this receipt task.
