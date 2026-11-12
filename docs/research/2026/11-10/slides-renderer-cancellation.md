# Slides cancellation — renderer boundary

Follow-up to the retained [production investigation](../../2026/11-07/slides-production-cancellation.md).
All four Chromium143 application identities remain failed. This source review
does not establish which endpoint was disposed, or a causal application patch.

At the exact143.0.7499.4 source, the network service's
[URLLoader](https://github.com/chromium/chromium/blob/143.0.7499.4/services/network/url_loader.cc)
registers disconnect and response-consumer-closed callbacks, but both handlers
call `NotifyCompleted(net::ERR_FAILED)`. That direct error code differs from the
observed `net::ERR_ABORTED`; body-pipe closure alone is not a demonstrated origin
for the specific terminal seen in application attempt10.

The renderer has separate aborted paths:

- [MojoURLLoaderClient](https://github.com/chromium/chromium/blob/143.0.7499.4/third_party/blink/renderer/platform/loader/fetch/url_loader/mojo_url_loader_client.cc)
  marks a closed connection aborted if it has not received completion. Its
  completion handler records receipt independently of body bytes. It also has
  an aborted redirect path while frozen; no such redirect is established here.
- [ResourceRequestSender](https://github.com/chromium/chromium/blob/143.0.7499.4/third_party/blink/renderer/platform/loader/fetch/url_loader/resource_request_sender.cc)
  turns a still-pending request into an aborted cancellation when deleting it,
  resets the loader and client, then defers request-info deletion. Its Cancel
  entry delegates to that cleanup.
- [Blink URLLoader](https://github.com/chromium/chromium/blob/143.0.7499.4/third_party/blink/renderer/platform/loader/fetch/url_loader/url_loader.cc)
  delegates cancellation through its context. These source paths do not identify
  which path or caller occurred in the retained run.

The [DevTools interceptor](https://github.com/chromium/chromium/blob/143.0.7499.4/content/browser/devtools/devtools_url_loader_interceptor.cc)
forwards completion separately from response/body and deletes its job on
shutdown. No runtime endpoint-disposal attribution follows from that source.
Native reader done, action acknowledgement, SQL and object success remain
separate from successful transport completion. Keep every original abort fatal.

A separate current-browser profile is now dependency-ready:
[Playwright1.65.0's browser manifest](https://github.com/microsoft/playwright/blob/v1.65.0/packages/playwright-core/browsers.json)
pins Chromium/headless shell158.0.8127.18 revision1254; the published test package
requires Node20 or later. Use an isolated pinned tool directory, preserving the
application, its frozen lock and all four existing journeys/assertions. This
qualifies a different browser/toolchain profile; even a pass would neither
repair nor retrospectively accept Chromium143, nor prove its cancellation cause.
See the [concrete check scope](../../../proposals/supabase-current-chromium-checks.md).
