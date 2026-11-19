-- Additive database-level protection against concurrent active/trial
-- subscription insertions for a single customer/product combination.
-- A suspended/expired/cancelled term can retain its historical identity.
-- Review existing data for duplicates before applying to a shared DB.
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_one_current_term_per_product
 ON subscriptions(customer_id,product_id) WHERE status IN ('TRIAL','ACTIVE');

-- The app's tenant creation path writes account_code. This additive column
-- matches the API payload; account-code assignment RPC remains external.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS account_code text;
CREATE UNIQUE INDEX IF NOT EXISTS tenants_account_code_unique
 ON tenants(account_code) WHERE account_code IS NOT NULL;
