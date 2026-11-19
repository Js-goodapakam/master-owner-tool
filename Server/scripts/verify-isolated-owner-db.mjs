import pg from 'pg';
import { assertIsolatedOwnerDatabase, verifyConnectedOwnerDatabase } from './assert-isolated-owner-db.mjs';
assertIsolatedOwnerDatabase();
const pool = new pg.Pool({connectionString:process.env.OWNER_TEST_DATABASE_URL,ssl:false,max:2});
try { console.log('Disposable owner test PostgreSQL:',JSON.stringify(await verifyConnectedOwnerDatabase(pool))); }
finally {await pool.end();}
