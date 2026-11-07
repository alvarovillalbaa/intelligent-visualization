# Supabase application attempt 7 — failed; post-failure observations retained

All four browser identities failed on an exact Slides publish request with HTTP 200 RSC headers followed by `net::ERR_ABORTED`. Fresh UI and SQL/Storage observations after those failures were positive, but the original errors were rethrown. No application identity is accepted.

- [Run 42340010938](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/42340010938), job `128305383056`: failure, 2026-11-07 04:48:14–04:52:17 UTC (243 seconds), attempt 1.
- Tested source: `e0cf4b9ea529b1d4d3a4fac9194e3521c2f72506`; activation: `1ab697d776c52aa8b944ebe50c3223ae280bf7c8`. The later publishing-feedback change was not tested here.
- [Exact controller JSON](supabase-application-attempt-7.json): 693,800 bytes, SHA-256 `f6de7dbe156c28915b3dfe0ffd681d9df1042c4a2ee799c8c22438ec827a16f2`, saved as emitted JSON plus one newline before interpretation.
- Emitted JSON without the file newline: 693,799 bytes, SHA-256 `a7ea8ac0862081c720b2edecd5f2047141297029a5279a7a445f8cfd741c42fa`.

## Post-failure UI and committed-state observations

Each diagnostic used the remaining time from the original shared 10-second publish deadline. All four observed an enabled Publish button, one newly labeled article with the expected title and live marker, and a fresh helper snapshot. The snapshot's current pointer, published status, password policy, label/source hashes and scoped artifact key matched. Artifact byte counts and SHA-256 matched between actual Storage reads and the separately hashed SQL HTML. The expected attachment remained in the public snapshot; the original source and victim object stayed excluded.

| Identity | Failed publish | Versions before → fresh | Diagnostic duration | Original deadline remaining | Artifact bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| Course / desktop | 2 | 2 → 3 | 666 ms | 8,739 ms | 19,233 |
| Report / desktop, secondary workspace | 1 | 1 → 2 | 632 ms | 8,845 ms | 19,233 |
| Course / narrow | 1 | 1 → 2 | 627 ms | 8,457 ms | 19,230 |
| Report / narrow | 2 | 2 → 3 | 704 ms | 8,429 ms | 19,230 |

The initial preview version is included in these counts. Every fresh snapshot has exactly one additional version, retains the previous artifact version, and selects a distinct new ID with one matching label hash. The safe DOM extraction returned only the validated artifact pathname/version ID; no signed query crossed that boundary. Retained snapshots contain metadata and digests, not raw artifact HTML.

These are fresh server-prop/UI and commit-consistency observations, not direct observation of the original ServerAction promise resolving, network EOF, or React debug-channel completion. All four failed diagnostics retain null `finishedAt`/`finishedResolvedAt`, the original failure as primary, and closed own timers/listeners. The full results remain four failed, retry 0, zero passed/skipped/flaky. Desktop Course and narrow Report completed their first unprotected Slides publication before failing the second; later full password/revisit coverage was not completed.

## Consumer, HMR and event evidence

The audit independently matched each failed publish's existing request-ID hash to exactly one observed consumer using method/path/action hash and its document/consumer ordinal. The matched readers had 10/13/16/19 fulfilled reads and 148,605/124,860/124,806/148,577 observed bytes respectively, native done, zero observed rejected/pending reads, cancellations or lock releases, and matching copied-byte/hash counts. Native done was recorded 0/1/2/1 ms before the Node failure callback. Cross-process callback timestamps do not establish causal wire ordering; native done is not network EOF proof. Raw RSC bytes were not retained, and the separate debug channel and all possible consumers are not claimed observed. Eight document snapshots contain 14 action readers overall without collection errors.

Fatal request-failure counts were 5/5/6/6; refused WebSocket counts were 1/0/0/1. The two refused sockets record `ws://127.0.0.1:3100/_next/webpack-hmr` with query key `id`, in public contexts. Each of those two cases records `view` and `slide_view` event requests finishing 200 and a `session_end` request classified as `ping` failing without a response. Request type alone does not establish its initiating API. The retained diagnostics also include unresolved navigation cancellations and other failed Slides actions. No WebSocket, beacon, cancellation or request-failure waiver was applied. See the [source investigation](slides-response-investigation.md) for the pinned source contracts and limits.

## Source, capture and resource audit

- All 203 retained sanitized captures decode and match lengths/SHA-256: 198 foreground streams, four managed-server streams and raw Playwright JSON, 312,510 bytes total. The captured Playwright JSON equals the stored report. Original secret-bearing streams were not archived; their observed counts/digests are not independently replayable originals.
- All 99 foreground children were reaped, both pipes reached EOF and original groups were absent. Only browser command 84 (zero-based) exited 1; the other 98 exited 0. No foreground timeout, TERM, KILL or forced drain occurred. Managed Next/proxy exited 0 after intentional stops, with closed outputs, absent groups and no KILL.
- All four reached full source guards match the 637 immutable tested Git leaves, modes, blobs, bytes and hashes: 17,008,610 bytes, vector `468861be58a1d04b40cd2fe8c6c6b2efc6888e7950dadb72402861462f9bd139`. All 286 exported inputs match, totaling 2,278,388 bytes. The after-browser success guard was not reached.
- All six earlier application receipts remain exact and false. Their protected input counts are 281/281/281/282/283/284 of 286, with exact code/documentation exceptions recorded separately. The accepted [90-case provider receipt](supabase-provider-attempt-8.json) remains separate, protecting 292/297 inputs; zero provider cases ran here. No combined 94-case pass is claimed.
- All 309 attributed process identities were gone without uncertain ownership or residual escalation. Runtime sessions ended at zero; journals/DNS restored, proxy activity/failures empty, Docker resources/ports released, and export/root identity/scratch-removal checks passed. Actual fixture contexts closed 2/2 per case with zero pending jobs/errors; the full journey required four contexts and remained incomplete.

Positive and missing-CA/wrong-SAN/wrong-password probes retained their expected finite results. One qualified Next-only window recorded six actual TLSv1.3 runtime sessions after helper closure; the second window was not reached. This owned CA/DNS/TLS and HTTPS-proxy fixture does not establish actual hosted Supabase/pooler, Vercel or hosted Auth acceptance.

Temporary workflow `410069399` was disabled after termination and freshly read back as `disabled_manually` at 04:53:41 UTC. This receipt task performed no retry, source fix, commit, push, branch retirement or factory mutation.
