# Visualization Schema

Canonical schema files:

- `packages/domain/entities.ts`
- `packages/domain/schemas.ts`
- `packages/domain/migrations.ts`

Supported kinds:

- `course`
- `slides`
- `report`

Every document has:

- `schemaVersion`
- `kind`
- title and SEO metadata
- audience and goal
- separated `visualDirection.layout` and `visualDirection.style`
- theme and brand
- source manifest
- asset references
- optional CTA, lead capture, and poll engagement
