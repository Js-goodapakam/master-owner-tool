import assert from 'node:assert/strict';
import test from 'node:test';
import { checkHostedStaging } from './check-hosted-staging.mjs';

const targets = {
  STAGING_OWNER_SUPABASE_URL: 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co',
  STAGING_OWNER_DATABASE_URL: 'postgresql://postgres@db.aaaaaaaaaaaaaaaaaaaa.supabase.co/postgres',
  STAGING_OWNER_BACKEND_ORIGIN: 'https://owner-staging.example.test',
  STAGING_STAY_SUPABASE_URL: 'https://bbbbbbbbbbbbbbbbbbbb.supabase.co',
  STAGING_STAY_DATABASE_URL: 'postgresql://postgres.bbbbbbbbbbbbbbbbbbbb@aws-0-region.pooler.supabase.com/postgres',
  STAGING_STAY_BACKEND_ORIGIN: 'https://stay-staging.example.test',
  RAZORPAY_KEY_ID: 'rzp_test_fixture',
};
test('accepts distinct project-matched staging configuration', () => {
  assert.doesNotThrow(() => checkHostedStaging(targets));
  assert.doesNotThrow(() => checkHostedStaging({...targets,STAGING_STAY_PUBLIC_API_ORIGIN:'https://stay-front-staging.example.test'}));
});
test('rejects missing, production, duplicated or mismatched targets and live keys', () => {
  assert.throws(() => checkHostedStaging({}));
  for (const [key, value] of Object.entries({
    STAGING_OWNER_SUPABASE_URL: 'https://wfugoojpmpqwjwbkxxrn.supabase.co',
    STAGING_STAY_SUPABASE_URL: targets.STAGING_OWNER_SUPABASE_URL,
    STAGING_STAY_DATABASE_URL: targets.STAGING_OWNER_DATABASE_URL,
    STAGING_STAY_BACKEND_ORIGIN: 'https://app-engagestay.vercel.app',
    RAZORPAY_KEY_ID: 'rzp_live_fixture',
    STAGING_STAY_PUBLIC_API_ORIGIN: 'https://app-engagestay.vercel.app',
  })) assert.throws(() => checkHostedStaging({ ...targets, [key]: value }), undefined, key);
});
test('rejects non-HTTPS, credential-bearing and non-origin OAuth targets', () => {
  for (const origin of ['http://stay-staging.example.test','https://person@stay-staging.example.test',
    'https://stay-staging.example.test/api',targets.STAGING_OWNER_BACKEND_ORIGIN]) {
    assert.throws(() => checkHostedStaging({...targets,STAGING_STAY_PUBLIC_API_ORIGIN:origin}));
  }
});
