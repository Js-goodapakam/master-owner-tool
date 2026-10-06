# FRIDAY MASTER OWNER

Central control plane MVP for Friday Innovations. It manages identity, customer/tenant assignments, plans, entitlements, configuration, infrastructure mappings, deployments and audit trails. Product operational data stays in the individual product systems.

## Quick start

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Open `http://localhost:5173`. With no `DATABASE_URL`, the API runs a clearly labelled in-memory demo dataset. For PostgreSQL/Supabase, set `DATABASE_URL`, run `npm run db:migrate`, then `npm run db:seed`.

```powershell
npm run lint
npm test
npm run build
```

## Repository layout

- `Client/` — React/Vite frontend
- `Server/` — Node.js REST API and shared TypeScript types
- `Database/` — PostgreSQL/Supabase migrations

See [architecture](docs/architecture.md), [database](docs/database.md), [API](docs/api.md), and [design system](docs/design-system.md).
