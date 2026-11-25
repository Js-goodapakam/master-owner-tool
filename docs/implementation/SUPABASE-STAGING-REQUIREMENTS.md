# Dedicated Supabase staging requirements

The GitHub Actions PostgreSQL 16 jobs use disposable containers and synthetic
data. They do not validate Supabase Auth, Storage, service-role behaviour, or
Supabase RLS in a hosted environment. Those checks require a separate staging
project; Production and shared Preview must never be substituted.

## Required setup

For P0-06, use one dedicated Supabase project per backend. Engage Stay's
operational property schema and Owner's platform schema have different
bootstrap requirements. Run `node scripts/check-hosted-staging.mjs` with
`STAGING_OWNER_SUPABASE_URL`, `STAGING_STAY_SUPABASE_URL`, each matching
`_DATABASE_URL` and `_BACKEND_ORIGIN`, and `RAZORPAY_KEY_ID` in a private
process environment. The check validates target identifiers without connecting.
Confirm the exact project references and deployment ownership in the dashboards.

Pin Owner to `6b845502709d6f247909c49805b00268c64a08fc` or a reviewed descendant
and Stay to `99fffbc132c3c3120364d48644aca0779ada9cbf` or a reviewed descendant.
Use dedicated Vercel projects or environments with verified isolated variables.
The disposable CI database bootstrap is solely for local/CI fixtures. On hosted
staging, use the real Supabase Auth and Storage schemas and apply Owner
`Database/migrations/001` through `018` in order. First confirm the canonical
Stay property and user schema baseline, then apply the Stay application SQL in
dependency order. Do not copy hosted production rows to bootstrap either app.

Set Owner's `ENGAGE_STAY_API_ORIGIN` and Stay's
`OWNER_CONTROL_PLANE_ORIGIN` to the corresponding staging backends. Set the same
fresh `ENGAGE_OWNER_SERVICE_TOKEN` on both backends. Restrict Owner
`CORS_ORIGIN` and Stay `CLIENT_ORIGIN` to the staging frontends. Configure
`PUBLIC_API_ORIGIN` for the host that serves Stay's public OAuth callback.
Keep email verification enabled and route staging mail to approved synthetic
inboxes. Register Google and Microsoft callbacks under the staging public origin.

Provide approved Test Mode Basic/Premium/Enterprise price rows for the periods
under test, in integer INR minor units with tax-inclusive treatment. Set
`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and a separate
`RAZORPAY_WEBHOOK_SECRET` on the Owner staging backend. Register
`/webhooks/razorpay` on its staging origin. Verify the delivery and expiry
handlers with staging credentials before enabling any staging scheduler.

1. Create a dedicated Supabase project named for non-production staging, with
   a distinct project reference, database, Storage, Auth users and service
   credentials.
2. Apply the reviewed Owner Tool migrations to that project, including private
   customer-document storage. Keep the document bucket non-public and use
   signed URLs or the protected backend for access.
3. Configure staging-only application variables: the staging Supabase URL,
   anon key, service key, database connection, Engage Stay staging API origin,
   Owner service token, and CORS origins. Store every value in the provider
   secret manager; do not commit it.
4. Register only staging OAuth redirect URLs for Google and Microsoft, for
   example the staging Engage Stay callback path. Use distinct provider
   credentials where the provider permits it.
5. Create synthetic employee and customer identities only. No Production users,
   customer records, documents, reservations, payments or OAuth tokens may be
   copied.
6. Run acceptance tests through both the authenticated server path and the
   direct database roles used by Supabase. Verify RLS with `anon` and
   `authenticated` contexts, then verify the service-role boundary separately.
7. Add an isolated staging deployment for each server and client. Its project
   variables must not reference Production or shared Preview hosts.

## Remaining staging acceptance tests

- Hosted Supabase RLS policies for Owner data and private documents.
- Supabase Auth identity bridge, including token refresh and suspension.
- Storage upload, signed preview/download, replacement and deletion rules.
- Google/Microsoft staging OAuth callback and signup intake.
- Full synthetic signup → approval → provisioning → PMS login lifecycle.

Creating the staging Supabase project requires access to the Supabase account
and a cost/resource decision. No production resource has been created or
changed by this CI work.
