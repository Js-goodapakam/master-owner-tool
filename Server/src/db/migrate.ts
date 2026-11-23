import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for migration');
// CI uses plain PostgreSQL rather than Supabase, so provide only the minimal
// auth.users relation needed by the control-plane foreign keys. This is never
// used in hosted environments, where Supabase owns the auth schema.
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined });
try {
  await pool.query('create schema if not exists auth; create table if not exists auth.users (id uuid primary key);');
  const directory = new URL('../../../Database/migrations/', import.meta.url);
  const files = (await readdir(directory)).filter(file => /^\d+_.*\.sql$/.test(file)).sort();
  for (const file of files) await pool.query(await readFile(new URL(`../../../Database/migrations/${file}`, import.meta.url), 'utf8'));
  console.log(`Applied ${files.length} migrations.`);
} finally { await pool.end(); }
