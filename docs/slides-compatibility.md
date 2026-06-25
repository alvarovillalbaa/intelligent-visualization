# Slides Compatibility

The existing slide-deck product remains in place during the migration.

Compatibility rules:

- Legacy `DeckSource` can be converted to a `SlidesVisualizationDocument`.
- Existing `/d/[teamSlug]/[deckSlug]`, `/embed/[publicId]`, and `/published/[publicId]/[versionId]` routes remain.
- Deck terminology may remain in migration and compatibility code.

Remaining work:

- Move all deck persistence behind visualization services.
- Migrate Convex deck records in place.
- Add old-route redirect/render tests.
