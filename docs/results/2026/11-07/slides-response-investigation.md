# Slides response investigation — source review only

This note supplements the [failed application attempt 5](supabase-application-attempt-5.md), its [original JSON](supabase-application-attempt-5.json), and the [application proposal](../../../proposals/supabase-browser-checks.md). No local runtime, runtime test, new pass, waiver or product fix is established here.

## Observed timing, without exact server-log correlation

Four exact browser publish requests received HTTP 200 RSC headers, then `net::ERR_ABORTED`, with no request-finished event or successful `response.finished()` observation. Narrow Course separately completed its first publication before its second failed.

| Failed publish | Browser start → failure | Last same-route Next POST log |
| --- | ---: | ---: |
| Desktop Course | 558 ms | 200 in 548 ms |
| Desktop Report | 1,109 ms | 200 in 1,095 ms |
| Narrow Course, second publish | 862 ms | 200 in 845 ms |
| Narrow Report | 502 ms | 200 in 492 ms |

The proximity is compatible with cancellation around server completion, but does not identify its cause. Next's retained lines lack absolute timestamps and request IDs; several actions POST to each editor path. These are ordering/path comparisons, not exact action joins, and a logged 200 is not body-EOF proof. The logs also contain ownership-refusal errors and an event JSON-parse error. No product stack trace identifying the publish abort was found; that is not proof that the product is fault-free or that an abort is harmless.

## Pinned Next 16.1.6 source

- The [header constant](https://github.com/vercel/next.js/blob/v16.1.6/packages/next/src/client/components/app-router-headers.ts#L33) is `x-nextjs-request-id`. The [action reducer](https://github.com/vercel/next.js/blob/v16.1.6/packages/next/src/client/components/router-reducer/reducers/server-action-reducer.ts#L120) generates it only outside production as a uint32 hexadecimal string, one to eight lowercase digits. Observe it unchanged; it is not a UUID or globally collision-free identity.
- The [compiled Flight reader](https://github.com/vercel/next.js/blob/v16.1.6/packages/next/src/compiled/react-server-dom-webpack/cjs/react-server-dom-webpack-client.browser.development.js#L4804) calls the original body stream's `getReader()` and repeated `read()`. `createFromFetch` also supports a separate debug-channel stream. Body EOF alone therefore does not establish whole React/debug-channel completion.
- The [development WebSocket](https://github.com/vercel/next.js/blob/v16.1.6/packages/next/src/client/dev/hot-reloader/app/web-socket.ts#L50) uses `/_next/webpack-hmr?id=…`. Attempt 5 retained only a generic unapproved-WebSocket observation, so its actual URL/source remains unknown.

## Observer limits to retain

Install per-instance reader hooks synchronously before React's continuation. Forward original receivers/arguments and return the same native objects/promises; issue no extra read, clone, tee, cancel or release. Do not root Responses, streams, readers or pending native promises in diagnostic state: retention could change garbage-collection/cancellation behavior. Track copied bytes only within bounds, and distinguish pre-close pending reads from closure-induced errors. Method interposition still adds observation overhead.

HMR and analytics require separate evidence, not exemptions. React `DeckPlayer` uses ordinary fetch for events; generated Slides HTML uses `sendBeacon` on page-hide/hidden with a keepalive-fetch fallback. Fetch hooks miss native beacons. The failed `/api/events` rows do not identify their event type or transport. Capture bounded source/transport metadata before proposing any classification change. No new product-fix justification is established yet.
