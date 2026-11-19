const forbidden = ['DATABASE_URL','POSTGRES_URL','POSTGRES_URL_NON_POOLING','SUPABASE_DB_URL','SUPABASE_DATABASE_URL','FRIDAY_PRODUCTION_DATABASE_URL'];
export function assertIsolatedOwnerDatabase(env = process.env) {
  const raw = env.OWNER_TEST_DATABASE_URL;
  const id = env.OWNER_TEST_DATABASE_ID;
  if (!raw || !id) throw Error('OWNER_TEST_DATABASE_URL and OWNER_TEST_DATABASE_ID are mandatory; no fallback is allowed.');
  if (!/^engage-owner-test(?:-|$)/.test(id)) throw Error('OWNER_TEST_DATABASE_ID must begin with engage-owner-test.');
  if (env.NODE_ENV !== 'test' || env.CI !== 'true' || env.GITHUB_ACTIONS !== 'true') throw Error('Disposable database requires GitHub Actions test context.');
  if (forbidden.some(key => env[key])) throw Error('Application or production database environment variables are forbidden.');
  if (['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY','SUPABASE_ANON_KEY'].some(key => env[key])) throw Error('Supabase runtime credentials are forbidden in the PostgreSQL test process.');
  let uri;
  try {uri = new URL(raw)}catch {throw Error('Invalid OWNER_TEST_DATABASE_URL.')}
  if (!['postgres:','postgresql:'].includes(uri.protocol)) throw Error('Test URL must use PostgreSQL.');
  if (uri.hostname !== '127.0.0.1' || uri.port !== '5432' || uri.pathname !== '/engage_owner_test' ||
      decodeURIComponent(uri.username) !== 'engage_owner_test' || !uri.password) {
    throw Error('Only disposable localhost PostgreSQL 16 database engage_owner_test is allowed; Supabase and remote endpoints forbidden.');
  }
  if ([...uri.searchParams.keys()].some(key => key !== 'sslmode') ||
      (uri.searchParams.has('sslmode') && uri.searchParams.get('sslmode') !== 'disable')) {
    throw Error('Unexpected PostgreSQL test connection options.');
  }
  return {database:'engage_owner_test',account:'engage_owner_test'};
}
export async function verifyConnectedOwnerDatabase(client, env = process.env) {
  const expected = assertIsolatedOwnerDatabase(env);
  const {rows,rowCount} = await client.query("SELECT current_database() AS database, current_user AS account, current_setting('server_version_num')::int AS version_number, inet_server_addr()::text AS server_address");
  const row = rows[0];
  if (rowCount !== 1 || row?.database !== expected.database || row?.account !== expected.account ||
      row?.version_number < 160000 || row?.version_number >= 170000 || !row?.server_address) {
    throw Error('Actual connected PostgreSQL database identity or PostgreSQL 16 version mismatch.');
  }
  return {database:row.database,account:row.account,version_number:row.version_number};
}
