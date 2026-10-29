# Report CSV import preparation

30 October 2026. Source work against clean personal main
`c6a4e6fe707fce6d4e6ff3ad904ba6d02ba6aeb8` adds a local CSV review and explicit
table/source-record append to the Report editor. This is source preparation;
the new domain, browser and temporary-CI scope has not been approved or run.

The [owning reference](../../../report-csv-import.md) defines the bounded CSV
profile, literal text behavior and two explicit actions: Add to the isolated
editor draft, then Apply to the current batch. One history step owns the table,
source metadata and all three layout placements. Existing Report JSON/layout
limits apply atomically. Pending reads are revoked on replacement, header-mode
change, cancel or unmount, with identity checks fencing late completions.

The source record retains the original label, row count, qualification and
SHA-256 of canonical parsed columns/rows. It does not archive file bytes or a
separate immutable table. Retention copy tells users to keep the original CSV.
Later table edits retain the original fingerprint. Apply now requires the
existing source records to remain an exact ordered prefix and accepts qualified
new SHA-256 records after it. The former path silently restored all old records
and discarded additions. Captured inputs, source manifest, assets, brand/theme,
generation metadata and current sibling formats retain their existing owners.

## Review and verification

Independent source reviews covered quote/record parsing, byte/row/column limits,
UTF-8/BOM/NUL handling, canonical hashing/private review identity, atomic append,
stale ownership, history and FileReader/pending-work lifecycle. This review did
not exercise product functions or browser behavior.

Static preparation passed TypeScript 5.9.3 syntax parsing/transpilation of ten
runtime/test/example/config files and resolution of 26 local imports. `node --check`
parsed the three affected case modules, and `git diff --check` passed. These
checks are not a broad TypeScript compile or a test run. The hosted build/type
and delivery state will be recorded separately after source publication.
The inactive workflow also passed YAML parsing, eight shell syntax checks and
four embedded Node-program syntax checks. Both official action pins resolve on
GitHub. No workflow was activated by these checks.

Two existing test inputs changed deliberately. The authoring preservation case
now asserts rejection of a rewritten source record, then independently checks
successful preservation with an unchanged prefix. Its assertions and case count
are retained. The editor callback harness gained dependency-aware `useCallback`
support because the production parent now provides a stable pending callback.
No test assertion was disabled or omitted.

Exactly 41 new CSV cases are authored. A separate
[approval proposal](../../../proposals/report-csv-import-checks.md) adds 127
focused regressions: 44 authoring, 19 editor and 64 Report artifact cases, for
168 unit cases. Four authored full-app scenarios across desktop and narrow
touch-emulated Chromium profiles propose eight browser runs. All 176 are
**unrun**. Browser generation and HTML boundaries are intercepted with authored
responses; those scenarios do not prove real generation, artifact compilation
or native downloads. The separate artifact cases exercise the compiler when
approved. No prior Course/Report/other-app approval is broadened.

The [source manifest](report-csv-import-source.json) lists exact case names,
profiles and 373 sealed file fingerprints, including four symlink target
strings without following vendor directories. Of 429 baseline leaves, all 422
outside the seven deliberately changed existing paths retain their Git blobs.
The proposed runner is inactive outside
workflow discovery. It requires a separate approval for one public Ubuntu job
capped at twenty minutes; no active CSV workflow is installed.

Storage Guard earlier in this work reported 27.9 GiB available against 34.0 GiB
required, including the 30 GiB reserve. No local dependency environment,
installation, build, application server, browser check or domain test was
started. No schema, provider, prompt, access policy, account, model call or paid
service changed. Existing GitHub publication and automatic Vercel delivery are
within the portfolio authorization.

## Remaining acceptance

Actual file-chooser/FileReader behavior, focus, touch, draft/history controls,
storage failures and reload behavior remain unverified until the new checks
are approved and run. Browser tests use authored fixtures and intercepted
boundaries; hosted account persistence, provider integration, original-file
archiving and full browser/download/print acceptance remain open. This slice
does not complete the application or portfolio goal.
