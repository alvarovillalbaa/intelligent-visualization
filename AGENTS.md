# Agent Instructions

- Preserve existing slide functionality while migrating toward `Intelligent Visualization`.
- Do not import provider SDKs outside their provider packages, `convex/**`, Worker code, migration tools, or tests.
- Do not claim a provider is supported until its adapter and shared provider contract tests pass.
- Keep local mode free of hosted-service requirements.
- Prefer application services and provider contracts over direct data-store access.
