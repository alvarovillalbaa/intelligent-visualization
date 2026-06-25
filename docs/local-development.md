# Local Development

The default local mode does not require hosted services.

```bash
npm install
npm run setup:local
npm run doctor
npm run dev
```

Seeded demo credentials:

- Email: `morgan@northstarlabs.com`
- Password: `demo1234`

Local paths:

- SQLite: `.data/intelligent-visualization.sqlite`
- Storage: `.data/storage`

Reset local state:

```bash
npm run db:local:reset
npm run setup:local
```

Export and verify local data:

```bash
npm run data:export -- --provider local --output .data/exports/export-001
npm run data:verify -- --input .data/exports/export-001
```
