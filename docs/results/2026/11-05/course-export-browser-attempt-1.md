# Course export browser attempt 1 — three passes, one boundary failure

5 November UTC / 6 November local, 2026. **Overall FAILED; no four-pass
invocation.** Preserve this result before observer/decoder repair.

Checked source `bc13c7c269bd29dd5987e257e69ae6f76922cc95`, tree
`c5ce2d93425258eea10f380af488d6393764b472`: 461 tracked files / 3,621,170 bytes.
[Run 42128567312](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/42128567312),
job `127599002235`, ran **23:18:10–23:19:25 UTC**, 75 seconds.

The full retained Playwright report has four exact title/profile pairs, each
attempted once with retry zero. Desktop retry, mobile native-file/runtime and
mobile retry passed; global errors, skips and flaky outcomes were zero.
Desktop native-file/runtime completed its original body assertions and saved
the 9,743-byte Course, but afterEach rejected **one unexpected local request**.
Its method/path were not recorded, so the endpoint and cause remain unknown.
Do not infer a benign development request or a production defect from this label.

The outer decoder then encountered a missing secondary error-context file
under the configured `preserveOutput: never` policy. Its generic
`controller_error` and first-row-only summary do not replace the complete
underlying four-case report, captured before parsing. Raw Playwright JSON is
19,612 bytes, SHA256
`329885528442aa4ebf60057b5ddac16be787a109a3513d0226f676edb2ea0aaf`.

The [canonical controller JSON](course-export-browser-attempt-1.json) is
**381,031 bytes**, SHA256
`ab30f778d525bf738e355bb2cd55957937eac3af595d0882bc1d9216333f155c`:
the exact emitted 381,030-byte JSON plus one LF. All 62 original command
streams were independently decompressed and checked against byte counts/SHA.
The browser CLI exited 1; the other 30 commands exited zero. Every original
group closed/reaped with EOF and no KILL. The Next server's intentional graceful
SIGTERM is separate from the foreground exit-zero rule.

Four full checkout guards and three 238-input / 1,957,569-byte export guards
passed. The permanent CI workflow stayed byte-identical. All 35 attributed
PID identities disappeared without supplementary signals or uncertainty;
port 3100 was unbound before launch and after teardown. Owned downloads,
processes and scratch cleanup passed. Neither the old 106-unit bundle nor
474-case normal CI was selected. Generation was authored; actual artifact
compilation, download and file interaction retain their scoped meaning.

Carry the three passed pairs only after validating their complete raw outcomes,
boundaries/cleanup and exact runtime-input equivalence against any completion
source. Rerun only desktop native-file/runtime, retaining its strict boundary
and every original assertion. Add bounded method/path diagnostics without
query/content capture; do not whitelist an unidentified request. Native devices,
printing, real generation, hosted persistence and full-product acceptance remain open.
