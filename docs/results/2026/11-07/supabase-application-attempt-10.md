# Supabase application attempt 10 — failed in production; original failures retained

Focused TypeScript and the real Next production build/standalone startup completed, but all four browser identities failed on their exact first Slides publication: HTTP 200 RSC headers followed by `net::ERR_ABORTED`. Direct awaited-label feedback and fresh UI/SQL/Storage observations were positive after each failure; the original failures remained fatal. No complete application journey is accepted.

- [Run 42344793733](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/42344793733), job `128320085406`: failure, 2026-11-07 05:56:14–06:00:13 UTC (239 seconds), attempt 1.
- Tested source: `026f25ef2d621ad74b0044c4f400b4cf535a4988`; activation: `d9c2946e9fbe10491fe07629031040db408bf06b`.
- [Exact controller JSON](supabase-application-attempt-10.json): 741,962 bytes, SHA-256 `5b1c3d3e2ac431d51fa0342f64c0480af5cedc7b2919764f790149382d7c47fe`, saved as emitted JSON plus one newline before interpretation.
- Emitted JSON without the file newline: 741,961 bytes, SHA-256 `d297af3181512f2a7fc75f280b15bda20555a7e0f3187ce2a1798ec1b618a089`.

## Executed production boundary

Command 3 (zero-based), the focused `tsc --noEmit` invocation covering nine explicit entries including the browser spec, exited 0 in 4.987 seconds. Command 64, `next build --webpack`, exited 0 in 39.080 seconds. The separate focused check remains necessary because Next filters test-file diagnostics. Both type-check records are completed; no ignored build errors or development fallback were used.

The generated standalone entry was a checked regular owned file, 6,518 bytes, SHA-256 `09e442b6195d67ddbe3c752506ba0ca399a3c6cba565c6eafb4644cf868d57ab`. The controller checked standalone output, `ignoreBuildErrors: false`, and the default `tsconfig.json` path. It copied and compared all five public files (3,314 bytes) and 53 static files (1,947,567 bytes). These generated files were not archived, so their full bodies cannot be independently replayed from the retained metadata.

The server ran `.next/standalone/server.js` with production environment, bound to `127.0.0.1:3100`, through configured `http://localhost:3100`. Localhost resolved only to `127.0.0.1`/`::1`, and the recorded connection peer was `127.0.0.1`. An owned random signing secret was shared and redacted without retaining its value. Build/helper processes and runtime clients were checked closed before Next startup. All four actual initial sign-ins recorded present, HttpOnly and Secure session-cookie booleans; no cookie values or manually injected cookies were retained. Fresh reauthentication was not reached.

This is still a URL route-handler-bypass control with CDP interception potentially active, not a fully unpaused baseline. Every original completion/failure gate remained. All four recorded zero active unknown-URL aborts and zero WebSocket/analytics-policy violations; every production WebSocket was forbidden. Additional root/owned-editor GET aborts and other Slides-action failures remained fatal. The recorded paths alone do not establish that those GETs were prefetch requests or identify their cancellation cause.

## Publication, consumer and terminal observations

All four exact selected publish requests independently bind uniquely across Node, passive CDP and native-consumer metadata by the raw UTF-8 body SHA/byte count plus method/path/action hash. Development request-ID hashes are null as expected; no replacement header was introduced, and no raw request body is retained. Missing or duplicate body bindings would remain unproven.

| Identity | Fatal request failures | Native fulfilled reads / decoded bytes | Encoded chunk sum | Feedback after failure | Post-failure snapshot / original deadline left |
| --- | ---: | ---: | ---: | ---: | --- |
| Course / desktop | 14 | 9 / 84,967 | 18,844 | 15 ms | 640 ms / 9,022 ms |
| Report / desktop, secondary workspace | 13 | 10 / 84,980 | 18,872 | 15 ms | 639 ms / 9,040 ms |
| Course / narrow | 12 | 11 / 84,932 | 18,854 | 18 ms | 639 ms / 8,950 ms |
| Report / narrow | 14 | 12 / 84,932 | 18,828 | 15 ms | 638 ms / 9,007 ms |

Each selected reader recorded native done with zero observed rejected/pending reads, cancellations or lock releases and matching copied-byte/hash counts. Native done occurred 0/1/0/0 ms before the Node failure callbacks. These callback timestamps do not establish causal wire ordering; native done is not network EOF proof. The separate React debug channel/all possible consumers are not claimed observed, and raw RSC bytes were not archived. Encoded CDP byte accounting is not decoded-body equality.

All 12 scoped CDP editor POST rows ended in `loadingFailed`; selected publish rows have `canceled: true` / `net::ERR_ABORTED`. No extra/conflicting terminal events were recorded. All four sessions enabled and detached within budget, removed own listeners, and had no errors, late creation or pending command jobs. Session scope is only the primary authenticated page; detach is not request-completion proof. Protocol monotonic seconds and wall-clock callback milliseconds remain separate.

Actual Publish clicks resolved in 38/37/44/51 ms. Each case retained five bounded document samples on one reviewed main-document identity, with no sample errors or samples after its original deadline. These discrete focus/visibility/ready-state samples do not prove continuous state or rule out unobserved transitions. The UI status follows the actual awaited action return, while each original `response.finished()` resolution remains unobserved/null and the exact request error remains primary.

All four fresh snapshots contained the new current published/unprotected version plus the retained initial preview: count 1 → 2. New IDs were not initial IDs; pointers, unique label/source hashes, actual Storage and separately hashed SQL HTML bytes/SHA matched. Attachment/public-snapshot boundaries remained checked, and signed query values were not returned by DOM extraction. The diagnostic rethrew every original error. Results remain four failed, retry 0, zero passed/skipped/flaky; later password/revisit coverage and the second Next-only TLS window were not completed.

## Independent source, capture and cleanup audit

- All 205 complete retained sanitized captures decode and match lengths/SHA-256: 200 foreground streams, four managed-server streams and raw Playwright JSON, 309,832 bytes total. Captured Playwright JSON equals the stored report. Secret-bearing originals were not archived; their observed byte counts/digests cannot be independently replayed as originals.
- All 100 foreground children were reaped, reached both pipe EOFs and had absent original groups. Browser command 85 exited 1; the other 99 exited 0. No foreground timeout, TERM, KILL or forced drain occurred. Managed Next/proxy exited 0 after intentional stops, with closed outputs, absent groups and no KILL.
- Four reached full source guards match all 645 immutable tested Git leaves, modes, blobs, byte counts and hashes: 18,866,873 bytes, vector `0079fe7676bfdd60ef4c5ecc06dc3805233598151e75911d732afe21e815a339`. All 286 exported inputs match, totaling 2,302,769 bytes, including exact equivalence to attempt 9's full runtime input set. The after-browser success guard was not reached.
- All nine previous application receipts remain exact and false. Protected-input counts are 278/278/278/279/279/280/280/280/286 of 286, with explicit narrow earlier code/documentation exceptions. The [90-case provider receipt](supabase-provider-attempt-8.json) remains separately accepted, protecting 290/297 inputs; zero provider cases ran here. No combined 94-case pass is claimed.
- All 157 attributed process identities were gone without uncertain ownership or residual escalation. Runtime clients ended at zero; journals/DNS restored, proxy active/failure counts zero, Docker resources/ports released, and export/root identity/scratch-removal checks passed. Each case closed its two created contexts without pending jobs/errors; full scope required four contexts and remained incomplete.

Positive and missing-CA/wrong-SAN/wrong-password probes retained their expected finite results. One qualified Next-only window recorded one actual TLSv1.3 runtime session after build/helper closure. The second window was not reached. This owned CA/DNS/PostgreSQL/private-Storage/localhost fixture does not establish actual hosted Supabase/pooler, Vercel or hosted Auth acceptance; see the [proposal](../../../proposals/supabase-browser-checks.md).

Temporary workflow `410105023` was disabled after termination and freshly read back as `disabled_manually` at 06:01:27 UTC. This receipt task performed no retry, source fix, commit, push, branch retirement or factory mutation.
