# Dedicated Supabase staging requirements

The GitHub Actions PostgreSQL 16 jobs use disposable containers and synthetic
data. They do not validate Supabase Auth, Storage, service-role behaviour, or
Supabase RLS in a hosted environment. Those checks require a separate staging
project; Production and shared Preview must never be substituted.

## Required setup

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
