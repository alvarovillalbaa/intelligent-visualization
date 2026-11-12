# Workspace removal attempt 1

**Failed harness preflight; no application checks ran.** Run
[43320299275](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/43320299275),
job `131538908188`, checked out `a24206740eefd175ce28000c8fc32834b8fa0dce`.
The source vector asserted regular-file modes only and rejected the four
already-tracked `.claude/skills/*` symlinks before npm installation. No tests,
browser, application database setup or product behavior was exercised.

The correction hashes symlink target bytes without dereferencing them. Skill
links are omitted from the isolated executable application copy; an unexpected
application symlink still refuses execution. Original job logs are preserved in
[the adjacent log](workspace-removals-attempt-1.log). GitHub removed the owned
PostgreSQL service container/network. The preflight failed before controller
receipt construction; this log, not a synthetic pass, is the evidence.
