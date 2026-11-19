import pg from 'pg';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assertIsolatedOwnerDatabase, verifyConnectedOwnerDatabase } from './assert-isolated-owner-db.mjs';
assertIsolatedOwnerDatabase(); // Before any SQL or connection.
const pool = new pg.Pool({connectionString:process.env.OWNER_TEST_DATABASE_URL,ssl:false,max:1});
try {
  const client = await pool.connect();
  try {
    const identity = await verifyConnectedOwnerDatabase(client);
    await client.query('BEGIN');
    try {
      // Vanilla PostgreSQL lacks Supabase-managed schemas. Minimum fake
      // foreign-key/bucket metadata only; NOT Supabase Auth or Storage.
      await client.query(
        'CREATE SCHEMA IF NOT EXISTS auth; ' +
        'CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY, email text); ' +
        'CREATE SCHEMA IF NOT EXISTS storage; ' +
        'CREATE TABLE IF NOT EXISTS storage.buckets(' +
        'id text PRIMARY KEY, name text NOT NULL, public boolean NOT NULL DEFAULT false, ' +
        'file_size_limit bigint, allowed_mime_types text[]);'
      );
      const directory=resolve('Database/migrations');
      const names=(await readdir(directory)).filter(name=>/^\d+_.+\.sql$/.test(name)).sort();
      if (names.length < 10) throw Error('Incomplete Owner Tool migration set');
      for(const name of names){
        await client.query(await readFile(resolve(directory,name),'utf8'));
        console.log('Applied isolated Owner schema migration',name);
      }
      const found=await client.query("SELECT to_regclass('public.onboarding_sessions') AS onboarding, to_regclass('public.provisioning_jobs') AS jobs, to_regclass('public.subscriptions') AS subscriptions");
      if(Object.values(found.rows[0]).some(x=>x===null))throw Error('Owner Tool schema not fully migrated');
      await client.query('COMMIT');
      console.log('Real PostgreSQL schema migrated, server version:',identity.version_number);
    }catch(e){await client.query('ROLLBACK');throw e}
  }finally{client.release()}
}finally{await pool.end()}
