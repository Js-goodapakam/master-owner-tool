# Architecture

`React web → REST API → authentication/RBAC → control services → PostgreSQL/Supabase`. The API is the only path to database and provider actions. `InfrastructureProvider` and `DeploymentProvider` are mock adapters today, intentionally isolated for AWS/Hostinger/custom implementations later. Authentication accepts Supabase JWTs when configured; local demo mode is intentionally marked and uses a Super Admin identity.

Control-plane records identify organizations, customers and tenants. Individual product databases own operational data. RLS policies scope customer users through `customer_id`; API service authorization independently verifies permissions and tenant scope.
