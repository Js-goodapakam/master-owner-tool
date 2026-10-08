import { query } from './client.js';

export type CustomerRow = {
  id: string;
  customer_code: string;
  company_name: string;
  legal_name: string | null;
  email: string;
  phone: string | null;
  industry: string | null;
  status: string;
  account_owner: string | null;
  created_at: string;
  city: string | null;
  country: string | null;
};

export type CreateCustomerInput = {
  companyName: string;
  legalName: string;
  email: string;
  phone?: string;
  industry: string;
  accountOwner: string;
  city?: string;
  country?: string;
};

export async function findCustomers(): Promise<CustomerRow[]> {
  const result = await query<CustomerRow>(
    `
      SELECT
        id,
        customer_code,
        company_name,
        legal_name,
        email,
        phone,
        industry,
        status,
        account_owner,
        created_at,
        city,
        country
      FROM customers
      ORDER BY created_at DESC
    `,
  );

  return result.rows;
}

export async function findCustomerById(
  id: string,
): Promise<CustomerRow | null> {
  const result = await query<CustomerRow>(
    `
      SELECT
        id,
        customer_code,
        company_name,
        legal_name,
        email,
        phone,
        industry,
        status,
        account_owner,
        created_at,
        city,
        country
      FROM customers
      WHERE id = $1
    `,
    [id],
  );

  return result.rows[0] ?? null;
}

export async function createCustomer(
  input: CreateCustomerInput,
): Promise<CustomerRow> {
  const customerCode = `FRI-${Date.now()}`;

  const result = await query<CustomerRow>(
    `
      INSERT INTO customers (
        customer_code,
        company_name,
        legal_name,
        email,
        phone,
        industry,
        status,
        account_owner,
        city,
        country
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        'ONBOARDING',
        $7,
        $8,
        $9
      )
      RETURNING
        id,
        customer_code,
        company_name,
        legal_name,
        email,
        phone,
        industry,
        status,
        account_owner,
        created_at,
        city,
        country
    `,
    [
      customerCode,
      input.companyName,
      input.legalName,
      input.email,
      input.phone ?? null,
      input.industry,
      input.accountOwner,
      input.city ?? null,
      input.country ?? null,
    ],
  );

  return result.rows[0];
}

export async function updateCustomer(
  id: string,
  input: Partial<CreateCustomerInput>,
): Promise<CustomerRow | null> {
  const result = await query<CustomerRow>(
    `
      UPDATE customers
      SET
        company_name = COALESCE($2, company_name),
        legal_name = COALESCE($3, legal_name),
        email = COALESCE($4, email),
        phone = COALESCE($5, phone),
        industry = COALESCE($6, industry),
        account_owner = COALESCE($7, account_owner),
        city = COALESCE($8, city),
        country = COALESCE($9, country),
        updated_at = now()
      WHERE id = $1
      RETURNING
        id,
        customer_code,
        company_name,
        legal_name,
        email,
        phone,
        industry,
        status,
        account_owner,
        created_at,
        city,
        country
    `,
    [
      id,
      input.companyName ?? null,
      input.legalName ?? null,
      input.email ?? null,
      input.phone ?? null,
      input.industry ?? null,
      input.accountOwner ?? null,
      input.city ?? null,
      input.country ?? null,
    ],
  );

  return result.rows[0] ?? null;
}