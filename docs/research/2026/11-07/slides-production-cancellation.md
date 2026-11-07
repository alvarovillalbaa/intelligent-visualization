# Slides cancellation: production observations and source limits

7 November 2026. [Control 10](../../../results/2026/11-07/supabase-application-attempt-10.md)
used source `026f25ef2d621ad74b0044c4f400b4cf535a4988`. Focused TypeScript,
the actual production build, standalone startup and initial Secure-cookie checks
passed. All four first Slides publications returned HTTP 200 RSC and then
`net::ERR_ABORTED`. All four journeys remain failed.

Clicks resolved in 37–51 milliseconds. Discrete samples retained the same focused,
visible document before the click, at headers, failure and acknowledgement; this
does not prove continuous document state. Direct returned-label acknowledgements
followed cancellation by 15–18 milliseconds. Fresh UI, SQL and private Storage
diagnostics finished with 8.95–9.04 seconds left in the original deadline.
Raw-body hash/byte/method/path/action joins uniquely bound Node, CDP and native
consumer observations. Durable publication and action resolution remain distinct
from transport completion.

Pinned source review found two relevant boundaries:

- [Next's action fetch](https://github.com/vercel/next.js/blob/v16.1.6/packages/next/src/client/components/router-reducer/reducers/server-action-reducer.ts#L142)
  supplies no AbortSignal. That does not rule out every browser/framework cause.
  [React Flight](https://github.com/vercel/next.js/blob/v16.1.6/packages/next/src/compiled/react-server-dom-webpack/cjs/react-server-dom-webpack-client.browser.production.js#L1926)
  returns the root result while its reader loop continues. An action acknowledgement
  therefore does not establish response EOF. Observed native reader completion
  and absence of recorded reader cancellation/rejection also do not override an
  actual failed network terminal.
- Playwright 1.57 expands a [function URL matcher](https://github.com/microsoft/playwright/blob/v1.57.0/packages/playwright-core/src/client/network.ts#L827)
  to `**/*`. Its [Chromium network manager](https://github.com/microsoft/playwright/blob/v1.57.0/packages/playwright-core/src/server/chromium/crNetworkManager.ts#L163)
  enables request-stage Fetch interception, including requests later automatically
  continued when no handler matches. Handler bypass is therefore still an
  instrumented transport; it is not an unpaused baseline or proven cause.

Production mode did not eliminate the cancellation. No causal product patch,
request-failure waiver or automatic eleventh run follows from these observations.
The next bounded source investigation is Chromium 143's DevTools Fetch/URLLoader
completion and cancellation handoff. Preserve the existing failure and cleanup
gates while that layer remains unresolved. No hosted/provider production result
is established here.
