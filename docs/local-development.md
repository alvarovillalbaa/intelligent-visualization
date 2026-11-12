# Local Development

The default local mode does not require hosted services.

```bash
npm install
cp .env.example .env.local
docker compose up -d postgres
npm run setup:local
npm run doctor
npm run dev
```

Seeded demo credentials:

- Email: `morgan@northstarlabs.com`
- Password: `demo1234`

Local paths:

- PostgreSQL: the explicit loopback `LOCAL_DATABASE_URL` (Compose port 54431).
- Storage: `.data/storage`
- Legacy slide storage: `.slides-storage`

Setup preserves existing rows. Reset no longer deletes data automatically:

```bash
npm run setup:local
```

Export and verify local data:

```bash
npm run data:export -- --provider local --output .data/exports/export-001
npm run data:verify -- --input .data/exports/export-001
npm run data:cutover:check -- --provider local --input .data/exports/export-001
```

Use a new output directory for every export. Backups contain authentication
hashes and legacy bearer links, omit sessions and do not copy storage objects.
Protect them and retain both object directories. Compare two verified exports
with `npm run data:compare -- --left <backup-a> --right <backup-b>`.
See [the migration and data boundaries](postgres-migration.md) before upgrading.
