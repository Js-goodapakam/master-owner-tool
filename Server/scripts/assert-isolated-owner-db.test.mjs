import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertIsolatedOwnerDatabase,verifyConnectedOwnerDatabase} from './assert-isolated-owner-db.mjs';
const good={
 OWNER_TEST_DATABASE_URL:'postgresql://engage_owner_test:synthetic-secret@127.0.0.1:5432/engage_owner_test',
 OWNER_TEST_DATABASE_ID:'engage-owner-test-github-actions',
 GITHUB_ACTIONS:'true',CI:'true',NODE_ENV:'test'
};
test('requires an explicit Actions test identity and URL',()=>{
 assert.throws(()=>assertIsolatedOwnerDatabase({}),/mandatory/);
 assert.throws(()=>assertIsolatedOwnerDatabase({...good,OWNER_TEST_DATABASE_ID:'preview'}),/begin with/);
 assert.throws(()=>assertIsolatedOwnerDatabase({...good,GITHUB_ACTIONS:'false'}),/GitHub Actions/);
});
test('rejects Supabase projects, remote/preview targets and fallback variables',()=>{
 for(const host of ['db.wfugoojpmpqwjwbkxxrn.supabase.co','db.trypyepdjmfjzofggduk.supabase.co','owner-preview.example.test','localhost'])
  assert.throws(()=>assertIsolatedOwnerDatabase({...good,OWNER_TEST_DATABASE_URL:good.OWNER_TEST_DATABASE_URL.replace('127.0.0.1',host)}),/disposable localhost/);
 assert.throws(()=>assertIsolatedOwnerDatabase({...good,OWNER_TEST_DATABASE_URL:undefined,DATABASE_URL:good.OWNER_TEST_DATABASE_URL}),/mandatory/);
 assert.throws(()=>assertIsolatedOwnerDatabase({...good,DATABASE_URL:'postgres://production.invalid/main'}),/forbidden/);
 assert.throws(()=>assertIsolatedOwnerDatabase({...good,SUPABASE_SECRET_KEY:'not-used'}),/forbidden/);
});
test('verifies the actual connected database name, account and server version',async()=>{
 const fake=row=>({query:async()=>({rows:[row],rowCount:1})});
 const row={database:'engage_owner_test',account:'engage_owner_test',version_number:160016,server_address:'172.17.0.2'};
 assert.equal((await verifyConnectedOwnerDatabase(fake(row),good)).version_number,160016);
 await assert.rejects(verifyConnectedOwnerDatabase(fake({...row,database:'postgres'}),good),/identity/);
 await assert.rejects(verifyConnectedOwnerDatabase(fake({...row,version_number:170000}),good),/identity/);
});
