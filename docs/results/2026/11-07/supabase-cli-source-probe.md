# Supabase CLI source-generation prerequisite

Accepted **source generation only**, 7 November 2026. This is not a database,
provider-contract, Auth/RLS, Storage, browser or hosted-production check.

- [Run 42318358578](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/42318358578),
  [job 128236526586](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/42318358578/job/128236526586),
  actual job interval **00:27:48–00:27:57 UTC**, conclusion `success`.
- Prepared source `c16f8ceae8be301432797c71edcc5889d8bd0a08`; activation
  `050bec88548975adf40426759c855db26624f1c7`.
- The unique actual `IV_SUPABASE_CLI_SOURCE_RESULT=` stdout record is preserved in
  [the original JSON](supabase-cli-source-probe.json), with one trailing newline:
  **125,207 bytes**, SHA256
  `ac10f2dad6d91b766b5c93afcbdb6fa8c9af085c859b2698330fa993396ac81f`.
  The marker's JSON itself was 125,206 bytes, SHA256
  `ade4eae2f7e8a582aeddb29eda885a30b00a8ae530a02238a1ceaa86bb872f85`.

## Actual generated source

The pinned CLI generated
`supabase/migrations/20261107002755_intelligent_visualization_hosted.sql`.
The file was **empty (0 bytes)**, mode `0644`, SHA256
`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
Its name came from the actual CLI result and filesystem observation, not an
authored timestamp. The owned runner copy was removed during verified scratch
cleanup; the JSON retains its complete empty content and path for source retrieval.
No SQL was populated or applied by this probe.

## Tool and stream identity

Supabase CLI **3.0.0** was downloaded from the exact official release, with no
package-manager or application install:

| Input | Bytes | SHA256 |
| --- | ---: | --- |
| `supabase_3.0.0_linux_amd64.tar.gz` | 63,799,117 | `eeb61edcd59a4735fcb5e58596574f25d03d420efca779f43ddb307e1cc5c754` |
| Official `checksums.txt` | 1,386 | `23763f31f1d3251c71cad4fd27577303f306514e2b99da91427a619d1800301f` |
| Extracted regular ELF | 140,507,312 | `1dde91b59c65297cfa0d1322a7337230d307e4e2696d16181577c0725bc50560` |

All **7 commands** exited zero, with complete original stdout/stderr, observed
exit/reaping, both pipe EOFs and original process-group absence. Independent
decoding verified **16 gzip records / 11,005 original bytes**: 14 command streams,
the checksum file and the empty generated migration. Each byte length and SHA256
matches its retained record. Help discovery preceded the named local generation.

All **4 complete source guards** match: **564 inputs / 10,790,049 bytes**, vector
SHA256 `2070d56e45d6c13d6412140f183dde17d77cf0b783391b95600999a6d4fe0aaa`.
Every source input's length, SHA256 and Git blob was independently checked against
the immutable prepared commit. The runner guards also bind index, working bytes,
file modes, symlink bytes and absence of ignored/untracked residue.

The **7 positively attributed process identities** were gone at completion; no
extra TERM/KILL, uncertain identities or residual processes were reported. Owned
scratch identity and removal passed. There were no database, stack startup,
login/link, product-test, application-build or browser commands.

## Limits and retirement

The [v3 breaking-change notice](https://supabase.com/changelog/supabase-cli-v3)
and [current CLI reference](https://supabase.com/docs/reference/cli/introduction)
were read before authoring. Documented telemetry opt-outs disable delivery but do
not prevent state-file writes according to the pinned CLI source. The probe used
an isolated owned `HOME` and `SUPABASE_HOME`, explicit delivery opt-outs and no
hosted credentials. This does not claim an OS-level zero-network trace; only the
two official release downloads and the recorded local CLI commands were invoked.

Workflow **409932222** was disabled through the supported GitHub Actions endpoint;
a fresh read returned **`disabled_manually`** at **00:32:16 UTC**. The QA branch
was subsequently retired at `ad42466a37cfef8707f7d620469b0d1e9d22eab4`, with the
same tree as receipt commit `537cae1303c1cf10357062498efac02f2523f55b`. Remote ref
readback confirmed retirement. The active workflow file is absent from that
tree; permanent CI is unchanged. No local CLI retry or permission change was made.
