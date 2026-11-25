import { pathToFileURL } from 'node:url';

const productionRefs = new Set(['wfugoojpmpqwjwbkxxrn', 'trypyepdjmfjzofggduk']);
const productionHosts = new Set([
  'master-owner-tool-server.vercel.app', 'master-owner-tool-client.vercel.app',
  'app-engagestay-server.vercel.app', 'app-engagestay.vercel.app',
]);

function parse(env, key) {
  try { return new URL(env[key]); }
  catch { throw new Error(key + ' must be configured as a URL'); }
}

export function checkHostedStaging(env) {
  const refs = new Set();
  const origins = new Set();
  for (const app of ['OWNER', 'STAY']) {
    const prefix = 'STAGING_' + app;
    const api = parse(env, prefix + '_SUPABASE_URL');
    const match = /^([a-z0-9]{20})\.supabase\.co$/.exec(api.hostname);
    if (!match || api.href !== api.origin + '/' || api.protocol !== 'https:' ||
        api.username || api.password || productionRefs.has(match[1]) || refs.has(match[1])) {
      throw new Error(prefix + '_SUPABASE_URL must identify a distinct staging project');
    }
    const ref = match[1];
    refs.add(ref);
    const db = parse(env, prefix + '_DATABASE_URL');
    const direct = db.hostname === 'db.' + ref + '.supabase.co';
    const pooled = db.hostname.endsWith('.pooler.supabase.com') && db.username.endsWith('.' + ref);
    if (db.protocol !== 'postgresql:' || (!direct && !pooled)) {
      throw new Error(prefix + '_DATABASE_URL must belong to the selected Supabase project');
    }
    const service = parse(env, prefix + '_BACKEND_ORIGIN');
    if (service.protocol !== 'https:' || service.href !== service.origin + '/' || service.username || service.password ||
        productionHosts.has(service.hostname) || origins.has(service.origin)) {
      throw new Error(prefix + '_BACKEND_ORIGIN must identify a distinct staging backend');
    }
    origins.add(service.origin);
  }
  if (!/^rzp_test_[a-zA-Z0-9_]+$/.test(env.RAZORPAY_KEY_ID || '')) throw new Error('A Razorpay Test Mode key ID is required');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    checkHostedStaging(process.env);
    console.log('Staging target configuration passed preflight. Confirm project ownership in the provider dashboards before use.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
