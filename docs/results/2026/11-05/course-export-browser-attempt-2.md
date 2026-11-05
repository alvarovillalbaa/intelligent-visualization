# Desktop completion attempt 2 — identified development-font boundary

5 November UTC / 6 November local, 2026. **FAILED; desktop acceptance remains
open.** The three previously passed pairs were verified and not rerun.

Source `66f926e0aa328673199fb331e29447d9883609c7`, tree
`43a965d582aaa81a440546c7580528bd97e2813d`: 463 files / 4,016,721 bytes.
[Run 42130120667](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/42130120667),
job `127604304046`, ran **23:32:21–23:33:27 UTC**, 66 seconds. Only desktop
native-file/runtime was selected, once with retry zero; its CLI exited 1.

The exact recorded rejected request is **GET
`/__nextjs_font/geist-latin.woff2`** at the loopback application origin. The
actual compiler/download/file assertions completed again: 9,743 bytes, SHA256
`f1f9924916bfe7f130fae6ff4f4ab26d2c62025d533e71168605e00e553553ab`,
two standalone loads and reset quiz/completion state. Page/global errors were
zero; the strict request boundary failed. Attempt 1 did not record its path,
so this observation does not retroactively identify that earlier request.

Next 16.1.6's primary [font styles](https://github.com/vercel/next.js/blob/v16.1.6/packages/next/src/next-devtools/dev-overlay/font/font-styles.tsx)
and [font middleware](https://github.com/vercel/next.js/blob/v16.1.6/packages/next/src/next-devtools/server/font/get-dev-overlay-font-middleware.ts)
identify this exact file as a bundled development-overlay asset, served locally
with `font/woff2`. This supports a narrow checker correction permitting only
that known GET/HEAD asset without a query. It does not justify an arbitrary
internal-route allowlist or change the application/standalone boundaries.

The [raw JSON](course-export-browser-attempt-2.json) is **378,015 bytes**, SHA256
`8e4fc3fb4b4e488b2b0e13bac3b7591f41299b026f4d1f1f71cc72f30ed04a09`.
Current/historical 124 original command streams and both raw Playwright reports
were independently decoded and hash/length checked. Current Playwright JSON:
10,781 bytes, SHA256
`4ee6be78d06cb1cb5ff575c5fa445058fe85a1857ec69aa718994620dc9a5141`.
The secondary missing error-context is now explicitly unretained metadata;
the complete primary case failure remains available.

Four current full source guards and exact equivalence of all 238 exported
runtime inputs passed. All 31 current groups released; 30 commands exited zero,
the browser exited 1, and the server's intentional graceful stop exited zero.
All 17 attributed PIDs disappeared without supplementary signals; the port and
owned scratch were released. Permanent CI and all original scenario assertions
remain unchanged. Publish this failure before correcting the single asset read;
rerun only desktop, retaining the three historical passes and all other guards.
