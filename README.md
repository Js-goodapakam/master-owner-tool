# FRIDAY MASTER OWNER

Central control plane MVP for Friday Innovations. It manages identity, customer/tenant assignments, plans, entitlements, configuration, infrastructure mappings, deployments and audit trails. Product operational data stays in the individual product systems.

## Quick start

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Open `http://localhost:5173`. With no `DATABASE_URL`, the API runs a clearly labelled in-memory demo dataset. For PostgreSQL/Supabase, set `DATABASE_URL`, run `npm run db:migrate`, then `npm run db:seed`.

## Deploy and connect EngageStay

The Owner Tool is not connected to EngageStay merely by running locally. Deploy the
Owner Tool and set the following **server-side** environment variables in its host:

```
ENGAGE_STAY_API_ORIGIN=https://<your-engagestay-api>
ENGAGE_OWNER_SERVICE_TOKEN=<the same secret configured in EngageStay>
```

Use a randomly generated secret of at least 32 characters. Configure the same value
as `ENGAGE_OWNER_SERVICE_TOKEN` in the EngageStay server, then redeploy both apps.
The **Integrations** module reports the real connection state. The customer overview
offers approve/provision, change plan/modules, suspend, and reactivate controls.

This repository includes a Vercel-ready `vercel.json`. Before a production release,
set `SUPABASE_*`, `DATABASE_URL`, `CORS_ORIGIN`, and the EngageStay values in the
Vercel project environment. Do not put service tokens in `VITE_*` variables.

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
