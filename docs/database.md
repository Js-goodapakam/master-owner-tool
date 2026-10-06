# Database

The migration in `apps/api/db/migrations/001_initial.sql` creates the control-plane schema, indexes, foreign keys, audit trigger helper, and RLS policies. Run migrations using a PostgreSQL connection string; then run the idempotent seed script. Never put a service-role key in the browser.
