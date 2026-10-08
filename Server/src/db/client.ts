import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : undefined,
});

export const query = <T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  values?: unknown[],
) => pool.query<T>(text, values);