# REST API

All API routes are under `/api`. Authenticated routes require a Supabase Bearer token in connected environments. Permissions are checked server-side; use `X-Demo-Role: Viewer` locally to verify denials.

Key endpoints: `GET/POST /customers`, `GET/PATCH /customers/:id`, `POST /onboarding`, `GET /products`, `GET /plans`, `GET/POST /subscriptions`, `GET /infrastructure`, `GET/POST /deployments`, `GET/PATCH /configuration`, `GET /audit-logs`, `GET /dashboard`.
