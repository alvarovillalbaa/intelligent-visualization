# Supabase policy diagnostic 3

7 November 2026: diagnostic collection completed; **provider acceptance remains
false**. The [exact result JSON](supabase-provider-diagnostic-3.json) reports
`diagnosticComplete:true`, `providerAccepted:false`, `passed:false` and zero tests.
A successful workflow exit means collection and cleanup completed, not acceptance.

- Source: `b2b404de76c6933fddb20823da53f93896d4f492`.
- Activation: `754fa1288bc785a354d086abb46f24425849eed2`.
- [Run 42324179976](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/42324179976),
  [job 128255521393](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/42324179976/job/128255521393):
  SUCCESS, 01:27:44–01:29:36 UTC. Branch `qa/supabase-provider-20261107-3`.
- Exact JSON: 266,607 bytes including its final LF, SHA-256
  `150464cbaaece4dcd6ba28bf411ebc35187b8ca7127d1c3f3717513e02321e49`.

## Observed policy difference

The actual LOGIN had `current_user=session_user=iv_runtime`, LOGIN enabled and
superuser, CREATE ROLE/DB, replication, BYPASSRLS, INHERIT and object ownership all
false. Its one membership row was:

| Granted role | Member | Grantor | ADMIN | INHERIT | SET |
| --- | --- | --- | --- | --- | --- |
| `iv_runtime` | `postgres` | `supabase_admin` | true | false | false |

The unchanged validator rejects any membership in either direction. This observed
incoming row therefore makes that predicate fail in QA3; the actual
`provider.health()` call returned the existing safe policy error. No membership
exception or other policy correction was applied.

The remaining collected metadata matched the source requirements: namespace
owner `postgres`, runtime schema USAGE without CREATE, no browser schema access,
the exact 22 expected tables with FORCE RLS and expected owners/ACLs/runtime
privileges, 22 exact policies, version-1 lineage and only the `legacy-slides` row
key. No payload, application user/session row or catalog password was selected.
The earlier automatic-creator-grant hypothesis is consistent with this observed
row; this run does not retrospectively reveal catalog rows from the failed QA2
stack.

## Evidence and closure audit

All 39 commands exited zero with both streams at EOF, direct children reaped and
original groups absent. All 78 retained sanitized captures decode with matching
byte counts and hashes: 47,173 retained bytes versus 47,586 observed original
bytes; two capture hashes changed through credential redaction. Original stream
bytes are not retained and cannot be independently replayed from these captures.
The catalog and health JSON values match their retained command output.

All five native/index/source guards match 604 files and 11,662,436 bytes; their
canonical source vector SHA-256 is
`65a00f4a3855930b134217545a58ca197039da67d7de8a702b4b9d8d4cbedc8c`.
The audit independently matched every reported blob/mode/size/hash against the
source Git objects. All 281 exported inputs (2,134,185 bytes), frozen dependency
lock and all 296 prior exported inputs remained exact. Both earlier failed JSON
receipts retain their recorded byte hashes; no prior cases were carried or rerun.

The 52 attributed processes left no residuals, uncertain identities or cleanup
signals. Runtime client, Auth user, Storage object and temporary-role counts were
zero. Exact owned Docker containers/networks/volumes were removed, baseline
objects preserved, ports released, exports unchanged, and scratch identity and
removal verified. No outside client or unknown resource was removed.

Workflow `409964711` (`.github/workflows/supabase-provider-checks-3.yml`) was disabled
after terminal status; a fresh readback confirmed `disabled_manually` at
01:31:09 UTC. No rerun, provider/factory enablement, local runtime or deployment
occurred. The next step is a reviewed correction based on these catalog rows and
new bounded contract verification; the application browser packet remains gated.

Root follow-up: QA3 was retired at
`3502d7dcd251c1fba7356a800b25c71d7274adf6`, with the exact canonical
`94850a9` tree and no active temporary workflow. GitHub ref readback confirmed
that retirement. The diagnostic JSON and its nonacceptance verdict are unchanged.
