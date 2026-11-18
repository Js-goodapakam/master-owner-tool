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

## Engage Stay OTA provider connectivity

Select **Engage Stay → Connected Integrations → OTA connectivity and feasibility**.
The provider catalog includes current official developer-documentation links, supported
capabilities, approval requirements, authentication prerequisites, and setup records
for Go-MMT, Booking.com, Agoda, Airbnb, Expedia, Channex, and SiteMinder.

**Production setup:**
1. Apply `Database/migrations/010_owner_ota_integrations.sql` to the Owner Tool Supabase project.
2. Set `OTA_CREDENTIAL_ENCRYPTION_KEY` **only on the Owner API server** to a
   randomly generated 64-character hex string (32 bytes). Protect and back up
   the key; losing it prevents decryption of saved credentials. Do not set `VITE_*`
   secrets or commit credentials to Git.
3. Redeploy Owner API and web client with the migration and environment changes.
4. Open the provider record and record only legitimate provider-issued IDs and
   access status. Save credentials using the protected backend form.
5. **Channex only:** After account approval, verify the API key against Channex
   `GET /api/v1/properties` (staging or production). A successful test verifies
   the Channex account, not connected hotel channels or OTA inventory sync.

All other providers remain unverified pending approved API access, completed
provider adapters and any required certification. **Do not mark OTA services
connected merely because their documentation exists or a credential has been stored.**

Property-specific hotel-code authorization, room/rate mapping, reservations,
webhooks and operational OTA synchronization belong in the Engage Stay app and
its secure backend. This Owner Tool feature is provider-level integration
administration, not the completed property/channel synchronization engine.
