# Supabase provider attempt 7 — failed

The fresh 90-case selection stopped after 27 passed and one failed; 62 cases were not run. This receipt does not accept the Supabase provider or enable either production factory.

- [Run 42329581776](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/42329581776), job `128272779104`: failure, 2026-11-07 02:30:29–02:32:57 UTC (148 seconds).
- Tested source: `07222ed647ae61aca315850548228027b672195e`; activation: `113fbce3d3a4424db67f915921f85d065b8511f5`.
- [Original controller JSON](supabase-provider-attempt-7.json): 307,635 bytes, SHA-256 `f7764d34669c564ee1c89b162c31ab37cb7cf529b0006d092369304a12dcfcaf` (exact emitted JSON plus one newline, retained before interpretation).
- Emitted JSON without the file newline: 307,634 bytes, SHA-256 `39a07fc29acfda49d3dd030300cef776e598c73cdbe50f7a09d70382772a8449`.

## Actual outcomes

| File | Passed | Failed |
| --- | ---: | ---: |
| `tests/providers/local-provider.test.ts` | 3 | 0 |
| `tests/providers/postgres-invariants.test.ts` | 11 | 0 |
| `tests/providers/legacy-postgres.test.ts` | 8 | 0 |
| `tests/providers/portable-postgres.test.ts` | 5 | 1 |

The failed identity is `private portable PostgreSQL backups rejects wrong counts and arbitrary entity or checksum paths before writes`. Its fixture disposal reported `Disposable PostgreSQL fixture has active clients; drop refused.` The later independent fixture-residue audit also exited 1 with `Unreleased local fixtures`. The observed count does not identify the clients or establish a root cause. The final residue audit does not establish whether those clients were still active then.

The remaining 40 focused unit, 14 Supabase contract, and eight native Storage/Auth cases were not executed. There is no current Storage outcome from this attempt. The earlier six failed or diagnostic receipts remain unchanged and nonaccepting; no accepted cases were carried.

## Independent receipt checks

- Decoded all 102 retained sanitized captures (98 command streams and four Vitest JSON files), 64,722 bytes total; every retained length and SHA-256 matches. These are complete sanitized captures. Secret-bearing originals were not retained; their observed counts and digests cannot be independently replayed from this packet.
- All four raw Vitest JSON files match their stored reports and exact source identities: 27 passed, one failed, zero pending/todo. Static source discovery confirms 90 unique literal identities across 11 selected files, identity-vector SHA-256 `478bb41e7f213f5787e91262733bc93cebd73f6a309560203abbc213d5fe390e`.
- All 49 commands were reaped with both pipes at EOF and original process groups absent. Commands 34 (portable Vitest) and 48 (final fixture audit), using zero-based indices, exited 1; the other 47 exited 0. No timeout, TERM, KILL, or forced drain was reported.
- Four reached full source guards match all 613 tested Git leaves, modes, blobs, bytes and hashes: 12,968,251 bytes; vector SHA-256 `f13b0d0aa0dc973e48e04d17a2856abafaf881feeda9ba6ec98d0b67a79ad26b`. The after-focused-checks guard was not reached.
- The 297 exported inputs total 2,304,342 bytes and match the tested source. Of QA5's 296 inputs, 293 are unchanged; only the three reviewed Storage implementation/test inputs differ. The diagnostic source is the additional input. Migration/template SHA-256 remains `73cde35f8ac0f265b1cda968fe1b4b91620ada03b4bab71d41c154c8d02fea43`.

## Closure and limits

Guarded regression fixture-database deletion and its final residue audit failed. They must not be labeled successful cleanup.

Separately, all 61 attributed process identities were gone without signals or uncertain ownership; the five-container Supabase stack, one network and two volumes were removed; ports were released; exported source was unchanged; scratch identity and removal checks passed. GitHub's outer `Stop containers` step succeeded for the separate PostgreSQL service. That outer teardown does not retroactively satisfy the failed fixture-drop gate.

Temporary workflow `409999734` was disabled after termination and freshly read back as `disabled_manually` at 02:33:54 UTC. No rerun, branch retirement, factory activation, hosted account call, browser journey, or production acceptance was performed by this receipt task. Actual local service checks do not prove hosted TLS/pooler, Vercel, or native application Auth behavior.
