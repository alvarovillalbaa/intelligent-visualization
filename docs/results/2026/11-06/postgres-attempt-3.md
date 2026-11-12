# PostgreSQL attempt 3 — streamed navigation cancellations

Source `13ec09644a2a560c164782e884571b0083dcacab`, activation
`196bf9fc41c83aa9809157d535b7ce711fe05937`,
[run 42187024842](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/42187024842),
job `127789686234`. Original receipt: `postgres-attempt-3.json`.

All 249 core inputs and the frozen lock matched the passing attempt 2; its exact
seven/28 identities and 33 original captures were verified without repeating
Vitest. Current install/lint/types, explicit setup and doctor passed.

Full page-load waits removed the previous static-script cancellations. Both
actual browser journeys again completed every UI assertion, but failed with
seven desktop/six narrow `net::ERR_ABORTED` requests: same-origin RSC reads and
server-action POSTs during transitions. Every diagnostic is now retained. No
unexpected request, HTTP/page/console error, extra socket or dialog was observed.
No browser acceptance is inferred. Response headers were not captured in this
attempt, so the cancellations cannot yet be independently classified.

All 22 current command streams, original browser JSON and both server streams
are retained, along with carried originals. Native/exported source, stream
closure, contexts, process/port, marked database and scratch cleanup passed.

Primary references consulted after this failure: [Playwright Request events](https://playwright.dev/docs/api/class-request)
distinguish received headers from completed bodies; [Next redirect](https://nextjs.org/docs/app/api-reference/functions/redirect)
describes streaming/client navigation versus progressive-enhancement redirects.
These references do not by themselves prove any recorded cancellation benign.
