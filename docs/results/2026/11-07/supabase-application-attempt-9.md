# Supabase application attempt 9 — failed after a successful build command

The owned Next production build command exited 0, but the controller then failed with `KeyError: 'tsconfigPath'` while inspecting the generated required-server-files configuration. The standalone server and browser journeys were not started. The overall result remains false; no application identity is accepted.

- [Run 42344160924](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/42344160924), job `128318157207`: failure, 2026-11-07 05:46:55–05:50:12 UTC (197 seconds), attempt 1.
- Tested source: `0caf57b9f623d08bef1b8d919900ac4f2ccfa8cb`; activation: `2c6fc28ae7a937902d44208cf6772e710a87585b`.
- [Exact controller JSON](supabase-application-attempt-9.json): 379,235 bytes, SHA-256 `f68b997132c73415d209993c806b8c512a5991dcae379b5788213fae7e215dab`, saved as emitted JSON plus one newline before interpretation.
- Emitted JSON without the file newline: 379,234 bytes, SHA-256 `91b1adf5ca31d9af4d893fb095fc71a4d9972eb3b795363dae7ba37138aca4f3`.

## Actual build and the failed controller gate

Foreground command 63 (zero-based) ran `node node_modules/next/dist/bin/next build --webpack` and exited 0 in 51.678 seconds. Its complete retained stdout is 1,777 sanitized bytes; stderr is empty. Next 16.1.6 reported successful compilation in 18.3 seconds, `Running TypeScript`, page-data collection with three workers, 15/15 generated static pages, final optimization, build traces and the route table. Both pipes reached EOF, the child was reaped and its original process group was absent, without timeout or supervisory signals.

The controller reserved the unchanged 720-second browser window plus 45 seconds for readiness/audit; the build command's available limit was 138.565 seconds. It subsequently indexed the absent `manifest.config.typescript.tsconfigPath` field at `build_production` line 952. The preceding standalone-output and `ignoreBuildErrors === false` assertion did not fail. The raw generated manifest was not archived, so its full contents cannot be independently replayed from this receipt.

This is positive command-level production-build evidence, not completion of the controller's stronger post-build gate. Preserve `semanticTypecheck.completed: false` and the absence of a `productionBuild` result. Entry-file identity, standalone public/static copy hashes, production listener/readiness, Secure-cookie runtime assertions, body-hash request correlations, all four browser journeys and both Next-only TLS windows were not reached. There is no development fallback, retry or application acceptance.

## Independent capture, source and closure audit

- All 158 retained sanitized captures independently decode and match lengths/SHA-256: 156 foreground streams and two proxy streams, 63,271 bytes total. Original secret-bearing streams were not archived; their observed byte counts/digests are not independently replayable originals. The owned signing secret is recorded only as generated, shared and not retained; no secret value or generated secret manifest is evidence.
- All 78 foreground commands exited 0, were reaped, reached both pipe EOFs and had absent original groups. No foreground timeout, TERM, KILL or forced drain occurred. The managed HTTPS proxy exited 0 after its intentional stop, with outputs closed, group absent and no KILL. No Next managed process exists in this attempt.
- All three reached full source guards match the 643 immutable tested Git leaves, modes, blobs, byte counts and SHA values: 18,477,250 bytes, vector `a95001007cf97a5b2192f7745191c7d1828def44ca3fa266135222e5be99a786`. All 286 exported inputs match, totaling 2,302,769 bytes. Before-browser and after-browser guards were not reached.
- All eight previous application receipts remain exact and false, with protected-input counts 278/278/278/279/279/280/280/280 of 286 and explicit narrow code/documentation exceptions. The [90-case provider receipt](supabase-provider-attempt-8.json) remains separately accepted, protecting 290/297 inputs; zero provider cases ran here. No tests or browser identities are carried into acceptance, and no combined 94-case pass is claimed.
- All 86 attributed process identities were gone without uncertain ownership or residual escalation. Runtime clients ended at zero; journals/DNS restored, proxy active/failure counts zero, Docker resources/ports released, and export/root identity/scratch-removal checks passed. Resource closure does not accept the failed production-control packet.

Positive and missing-CA/wrong-SAN/wrong-password probes retained their expected finite results through the owned production factories. Those helper observations are separate from Next: no Next-only TLS window ran. The disposable CA/DNS/PostgreSQL/private-Storage fixture does not establish real hosted Supabase/pooler, Vercel or hosted Auth acceptance. See the [production-control proposal](../../../proposals/supabase-browser-checks.md) for the still-unverified browser scope.

Temporary workflow `410100096` was disabled after termination and freshly read back as `disabled_manually` at 05:50:52 UTC. This receipt task performed no retry, source fix, commit, push, branch retirement or factory mutation.
