# Workspace removal attempt 4

**Overall failed: 32/34 core checks passed; browser unrun.**
[Run 43321493739](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/43321493739),
job `131543009901`, source `bbc6f6391539dbec8a783f0d5b75fae8e9a5c1c1`.
Frozen install, scoped ESLint and focused TypeScript passed.

All 18 HTTP/client checks and 14 PostgreSQL cases passed, including actual
restricted-runtime-role removal, fresh authorization, conflicts, competing
removals, cached result refusal, private getters, full v2 export/import and
explicit v1 upgrade. These 32 identities remain accepted at this original source,
not as a later single invocation.

Two fixture failures remain false: the direct-SQL wait test opened an outer
transaction on the fixture pool but called the provider's other pool, so removal
had already committed and no waiter remained; the all-child guard test attempted
to build its second graph with the same unique review token. The correction
injects the transaction's actual database for the wait case and supplies a unique
token only for the second graph. Production source is unchanged. Only those two
cases and the four previously unrun browser scenarios proceed next.

[Original receipt](workspace-removals-attempt-4.json): raw 156,546 bytes, SHA-256
`0120819754814a30e8535e51d4a634bbafaf921990a1d9b63fb054903eec02d6`.
No skipped/pending core case. The passing test bodies await the fixture's checked
drain/drop, but the JSON-only reporter did not retain its console diagnostics.
Command cleanup and final source parity are retained. The next two-case run adds
the default reporter and a direct database/role inventory audit. No local heavy
action or live cutover.
