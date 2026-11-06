# Agent Instructions

- Preserve existing slide functionality while migrating toward `Intelligent Visualization`.
- Do not import provider SDKs outside their provider packages, migration tools, or tests.
- Do not claim a provider is supported until its adapter and shared provider contract tests pass.
- Keep local mode free of hosted-service requirements.
- Prefer application services and provider contracts over direct data-store access.
- Alvaro's standing "I approve everything / Keep going / Do all the work"
  authorization covers the four existing Course export browser identities in
  `docs/proposals/course-export-browser-v2.md` and their bounded temporary CI.
  Do not repeat the closed 474-test/build result or old 106-unit bundle.
- Preserve the permanent `ci.yml`. Main preparation/retirement uses the existing
  `[skip actions]` convention; the focused QA push uses a non-skipped activation.
  Do not call skipped normal CI a pass. Build inputs/tooling/server/downloads
  stay in owned runner storage; no local install/build/server/browser follows
  the failed Storage Guard reserve. Generation is authored; artifact compilation
  and saved-file behavior must be actual, with no account, database or model call.
- Course export's four browser identities are accepted: three first-run passes
  and one desktop completion, with exact runtime-input equivalence. Preserve
  both failures and do not rerun accepted journeys unchanged. Only the exact
  query-free Next development font joins the app's static-read boundary; the
  standalone file retains all network/storage tripwires. No application,
  dependency, lock or permanent CI change was made by this verification packet.
