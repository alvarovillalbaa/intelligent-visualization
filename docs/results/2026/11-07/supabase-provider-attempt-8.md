# Supabase provider attempt 8 — focused contracts passed

All 90 selected cases passed freshly across 11 reports, with zero failed, pending or todo cases. Scoped lint and semantic TypeScript checks also passed. This accepts the bounded local-service contract packet; production factories remain disabled and application/hosted acceptance is still pending.

- [Run 42330511163](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/42330511163), job `128275718031`: success, 2026-11-07 02:41:54–02:44:33 UTC (159 seconds).
- Tested source: `4da1844f22a332aad8bd827a026c3a806b4a308f`; activation: `b9689dd44ab71edb64964437ba939508ba2763ee`.
- [Original controller JSON](supabase-provider-attempt-8.json): 369,374 bytes, SHA-256 `24e75dfa95b776210d369129d2a592f231e7dca8c78741910f1ab18e5ab74441` (exact emitted JSON plus one newline, preserved before interpretation).
- Emitted JSON without the file newline: 369,373 bytes, SHA-256 `3d5759773c4c514d6fba65379ed018949fe7a147b0fb6735459fe675544a66d6`.

## Actual selection

| Scope | Cases passed |
| --- | ---: |
| Affected local PostgreSQL provider, invariant, legacy and portable contracts | 28 |
| Focused Storage, public-asset/password, URL-policy and upload-ownership units | 40 |
| Actual restricted-role Supabase PostgreSQL contracts | 14 |
| Actual private Storage/Auth boundary contracts | 8 |

Every selected file was invoked once, with CLI exit 0. The retained Vitest JSON contains all 90 exact unique source identities. The identity-vector SHA-256 is `478bb41e7f213f5787e91262733bc93cebd73f6a309560203abbc213d5fe390e`. No earlier cases were carried into acceptance.

## Independent receipt checks

- Decoded all 127 retained sanitized captures: 116 command streams and 11 raw Vitest JSON files, 92,353 bytes total. Every retained byte count and SHA-256 matches; raw JSON and stored report fields agree. Secret-bearing originals were not retained; their observed counts/digests cannot be independently replayed from this packet.
- All 58 commands exited 0, were reaped, reached EOF on both pipes and left their original process groups absent. No timeout, TERM, KILL or forced drain was reported.
- Five full source guards match all 615 tested Git leaves, including modes, blobs, bytes and SHA-256 values: 13,284,950 bytes, vector `1940341e85d2b3a699b31cfc2abc3c31415807206d54b6924d1364fca81859bc`.
- The 297 exported inputs total 2,308,931 bytes and match the tested source. Only `tests/providers/postgres-fixture.ts` differs from QA7; the other 296 inputs are exact. The fixture is 7,913 bytes, SHA-256 `8ad6e6f81f494193c6b8cfaee9f24f227345f236fe6f128056c66b28e1c0a424`.
- Frozen dependency lock: 618,662 bytes, SHA-256 `b18dd278e6eded698e269d2e8400b0359083a8ba34de4721227a70b5e27c0d59`. Migration/template SHA-256 remains `73cde35f8ac0f265b1cda968fe1b4b91620ada03b4bab71d41c154c8d02fea43`.
- All seven prior failed/nonacceptance receipt byte/hash/source pins match and their verdicts remain false. QA8 does not retrospectively explain or accept QA7.

## Closure and proof limits

Both independent local fixture-database audits report an empty list. No `IV_POSTGRES_FIXTURE_DRAIN` or `IV_POSTGRES_FIXTURE_RELEASED` markers were retained in command streams or ordinary job-log lines, so this packet cannot report per-session pending-to-zero transitions, states or timing. The source drain/identity gates and successful test outcomes do not supply those missing diagnostic rows.

All 75 attributed process identities were gone, with no uncertain ownership or residual escalation. Five Supabase containers, one network and two volumes were removed; ports were released; export bytes stayed unchanged; scratch identity/removal passed. GitHub's outer PostgreSQL service-container teardown also succeeded.

The actual checks use `iv_runtime` LOGIN, the installed private schema, disposable native Supabase services, and an explicitly mapped fixed HTTPS Storage fixture origin to owned loopback HTTP. They do not prove production TLS/pooler, the production selection factories, Next application sessions, hosted Auth mapping, Vercel, browser journeys or live account behavior. No model/provider generation or hosted account/settings calls were made.

Temporary workflow `410006363` was disabled after termination and freshly read back as `disabled_manually` at 02:45:38 UTC. No rerun, branch retirement, commit, push or factory activation was performed by this receipt task.

Root follow-up: the provider QA branch was retired at
`1f99475032207ce9905c2ed23c3b110091f3f429`, with the exact canonical
`4d6545d` tree and no active temporary workflow. GitHub ref readback confirmed
the retirement. The accepted JSON remains unchanged; later factory wiring and
application checks have separate sources and outcomes.
