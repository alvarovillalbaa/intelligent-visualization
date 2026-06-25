# Artifact Runtime

The compiler entrypoint is `compileVisualizationArtifact` in `lib/artifacts/compiler.ts`.

Current behavior:

- Accepts typed visualization documents only.
- Validates through Zod migration.
- Escapes HTML.
- Produces standalone HTML.
- Produces a manifest with document hash, artifact hash, renderer version, source hashes, assets, and runtime features.
- Uses trusted inline runtime code for analytics beacons and course progress.
- Does not load external JavaScript from a CDN.

Remaining work:

- Full deterministic QA pass.
- Stronger CSP response integration.
- Rich report chart rendering.
- More complete course and slide interactions.
