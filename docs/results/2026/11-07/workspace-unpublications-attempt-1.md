# Unpublication attempt 1 — core passes, browser network boundary fails

Prepared source `3c0045290aebea045ebadff098b3c9b5c4769391`, activation
`e15c216238fe326dc8ca6347e52d989823e208f3`,
[run 42313570037](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/42313570037),
job `128220636489`. The run occurred on 6 November UTC / 7 November Madrid.
Temporary workflow `409906854` is disabled. The original
[362,748-byte JSON](workspace-unpublications-attempt-1.json) has SHA256
`f1e3ff1832a9969249c8a057429ff80cebc86abbde5d637ef0cca324e8fddb41`.

All thirteen HTTP, six client and twenty real PostgreSQL cases pass, with exact
unique names/statuses and raw original JSON. Frozen install, scoped lint/types,
setup/doctor and actual readiness also pass. These thirty-nine core results can
be retained only after validating their original captures and protected inputs.

All four browser journeys complete their functional assertions: twelve actual
publication POSTs, four Unpublish POSTs and eight revision saves; eighty explicit
anonymous GET/HEAD/conditional 404 probes; preserved unsaved edits, later private
save/reload and republishing without old-version resurrection; twenty-four actual
fixture-owned object observations with unchanged earlier bytes. Already-open
pages remain visible. No admitted-request race was executed.

None of those four journeys is accepted. The strict network boundary observes
six publication-status GET failures with `net::ERR_ABORTED` after 200 headers:
desktop Course one at publish-2; desktop Report two at save-2/refresh-unpublished;
narrow Course one at save-3; narrow Report two at publish-2/private-reload. Other
error counters are zero. Qualified streamed-navigation cancellations remain
separate observations, counts 2/2/2/1. The POST observer records all six real
response bodies per journey but does not observe status GET consumption or
native signals. Headers and completed UI steps do not prove which GET consumed
its complete body or what caused its abort. Preserve that uncertainty; no network
failure rule is waived or application fix claimed.

All 38 original captures total 162,715 decoded bytes and verify their gzip/base64,
length, SHA256 and completeness. Current raw Playwright JSON equals its parsed
report, with zero expected passes and four unexpected failures. Sixteen commands
reach EOF/reaping/group closure; only browser command index 14 exits nonzero.
Four full source guards match 555 leaves/9,913,386 bytes, vector SHA256
`225f494632d43262df963beab874c0b7d8746e0ed601606ae91212e8dbfbb73d`.
The failed browser phase does not create a fifth after-browser guard. All 270
runtime export inputs total 2,162,851 bytes. Marked database removal, zero residual
or uncertain processes, original process-group absence, port release, unchanged
export and owned scratch identity/removal pass. The overall verdict remains false.

Next isolate status-read lifecycle/observation and intentional navigation timing.
Keep accepted core identities unchanged rather than rerunning them. All four
browser identities still require a strict current-source pass. No hosted
configuration, local install/build/server/browser/database, paid service, account,
model call or production data was involved.
