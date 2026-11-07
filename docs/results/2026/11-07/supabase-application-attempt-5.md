# Supabase application attempt 5 — failed with exact request evidence

All four browser identities failed; none is accepted. The corrected locator admitted actual Slides publish requests. Four exact requests received HTTP 200 RSC headers and then failed with `net::ERR_ABORTED` before a successful finished-response observation. No abort waiver or harmlessness claim is made.

- [Run 42336566249](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/42336566249), job `128294703777`: failure, 2026-11-07 04:01:24–04:06:34 UTC (310 seconds).
- Tested source: `edb2a5df9820248b4263285608ef7b60a7365194`; activation: `6cce089933fac4c86d9d59082273b8d5f192dfca`.
- [Original controller JSON](supabase-application-attempt-5.json): 604,336 bytes, SHA-256 `605c4ee76b2fe4d745ea4bb7d97b69cc7307aa1accc97cd1ed55b93617254805` (exact emitted JSON plus one newline, saved before interpretation).
- Emitted JSON without the file newline: 604,335 bytes, SHA-256 `70ddf2d5acd934f2592206436a3d6058775c935bd5b02308ec6f17d7ee0bd628`.

## Actual request and browser outcomes

| Identity | Failed Slides publish | Exact request result | Total fatal request failures |
| --- | ---: | --- | ---: |
| Course / desktop Chromium | 1 | 200 headers, then `net::ERR_ABORTED` | 4 |
| Report / desktop Chromium, `secondary-reports` | 1 | 200 headers, then `net::ERR_ABORTED` | 6 |
| Course / narrow Chromium | 2 | 200 headers, then `net::ERR_ABORTED` | 7 |
| Report / narrow Chromium | 1 | 200 headers, then `net::ERR_ABORTED` | 4 |

Each failing diagnostic binds the actual POST's deck/editor path, Next-Action identifier hash, label hash, source hash and payload byte count; no raw action payload or password is retained. Each records `response-finished` phase, `text/x-component` HTTP 200, an actual request-failed timestamp and error, null request-finished and finished-resolution timestamps, and closed diagnostic listeners/timer. Neither response headers nor partial database mutation imply successful publication delivery. The underlying abort cause remains unproven.

Narrow Course's first publication is a distinct completed control: its actual request-finished event and successful `response.finished()` null observation precede an enabled button and fresh private Storage snapshot. It also recorded the subsequent historical-collision refusal/restoration checks. Its second publish still failed, so that partial control does not accept the full identity.

Narrow Course additionally recorded one fatal unapproved WebSocket at `slides-public-attachment` and two aborted `/api/events` POSTs without observed responses when leaving the public page. Other recorded upload/foreign-registration action aborts and unproven navigation cancellations also remain fatal. No rules were relaxed.

All four cases ran once with retry 0, zero passed/skipped/flaky. All retain partial canonical observations of two publications, five JSON response proofs and 13 negative checks; snapshot counts are 4/4/5/4. Actual browser fixtures closed both created contexts, with zero pending jobs or cleanup errors, while the full-scope four-context assertion remained unmet. Later protected publication and complete application/hosted journeys are not accepted.

## Transport, source and closure audit

- Scoped lint/types passed. Two fresh positive helpers and the three missing-CA/wrong-SAN/wrong-password probes completed with the expected finite outcomes. The first qualified Next-only snapshot recorded five actual TLSv1.3 runtime sessions after helper closure. The second window was unrun; continuous journey-wide TLS is not claimed. These are owned CA/DNS/TLS and HTTPS proxy fixtures, not real hosted Supabase/pooler/Vercel or hosted Auth proof.
- All 203 retained sanitized captures decode and match lengths/SHA-256: 198 foreground streams, four managed-server streams and raw Playwright JSON, 255,975 bytes total. Raw JSON equals its stored report. All four bounded boundary attachments and five bounded Slides diagnostic records were checked, including the one completed control. Secret-bearing originals were not archived and cannot be independently replayed from observed digests.
- All 99 foreground children were reaped with both pipes at EOF and original groups absent. Only browser command 84 (zero-based) exited 1; the other 98 exited 0. No foreground supervisor timeout, TERM, KILL or forced drain occurred. Next and the HTTPS proxy exited 0 after separately recorded intentional stops, with output files closed, groups absent and no KILL.
- Four reached full source guards match all 632 tested Git leaves, modes, blobs, bytes and hashes: 15,699,627 bytes, vector `638127e1050d867df2861aa0b2061570f0031c3c71b49a839c596308a55ec984`. All 286 exported inputs match, totaling 2,253,164 bytes. Relative to attempt 4 only the reviewed UI/spec inputs differ (284 protected); relative to attempts 1–3 the four reviewed inputs differ (282 protected each).
- All 298 attributed process identities were gone without uncertain ownership or residual escalation. Runtime sessions ended at zero; journals and DNS were restored, proxy activity/failures ended empty, Docker resources and ports released, and export/scratch identity/removal checks passed. The real seed/audit retains eight users, eight teams, nine workspaces, eight decks and eight original/victim proof objects. Report desktop used the secondary workspace; it has no complete Slides publication control.

All four earlier application receipts remain byte/hash-pinned and false. The [accepted 90-case provider receipt](supabase-provider-attempt-8.json) remains separate and unchanged; zero provider cases executed here. This is not a combined 94-case invocation or application acceptance.

Temporary workflow `410046536` was disabled after termination and freshly read back as `disabled_manually` at 04:08:25 UTC. No retry, source fix, commit, branch retirement, push or factory mutation was performed by this receipt task.
