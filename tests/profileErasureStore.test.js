const test=require('node:test');
const assert=require('node:assert/strict');
const {createProfileErasureStore}=require('../src/profileErasureStore');

const ACTOR='1494609975031369828';

function database({legacyTable=true,failLegacyDelete=false}={}){
 const statements=[];
 const db={
  async query(sql){
   statements.push(sql);
   if(sql.startsWith('SELECT * FROM poke_post_profiles'))return {rows:[{discord_user_id:ACTOR,trainer_code_raw:'123456789012'}]};
   if(sql.startsWith('SELECT to_regclass'))return {rows:[{table_name:legacyTable?'friendcode_profiles':null}]};
   if(sql.startsWith('DELETE FROM friendcode_profiles')&&failLegacyDelete)throw Error('Legacy deletion failed');
   return {rows:[]};
  },
  release(){}
 };
 return {pool:{connect:async()=>db,query:db.query.bind(db)},statements};
}

test('erasure removes an imported legacy copy before committing',async()=>{
 const {pool,statements}=database();
 const store=createProfileErasureStore(pool);
 const snapshot=await store.snapshot(ACTOR);
 assert.equal(await store.erase(ACTOR,snapshot.fingerprint),true);
 const oldDelete=statements.indexOf('DELETE FROM friendcode_profiles WHERE discord_user_id=$1');
 assert.ok(oldDelete>=0);
 assert.ok(oldDelete<statements.lastIndexOf('COMMIT'));
});

test('erasure also works in databases without a legacy table',async()=>{
 const {pool,statements}=database({legacyTable:false});
 const store=createProfileErasureStore(pool);
 const snapshot=await store.snapshot(ACTOR);
 assert.equal(await store.erase(ACTOR,snapshot.fingerprint),true);
 assert.ok(!statements.includes('DELETE FROM friendcode_profiles WHERE discord_user_id=$1'));
});

test('a failed legacy deletion rolls back the shared profile deletion',async()=>{
 const {pool,statements}=database({failLegacyDelete:true});
 const store=createProfileErasureStore(pool);
 const snapshot=await store.snapshot(ACTOR);
 await assert.rejects(()=>store.erase(ACTOR,snapshot.fingerprint),/Legacy deletion failed/);
 assert.equal(statements.at(-1),'ROLLBACK');
 assert.ok(!statements.includes('COMMIT'));
});
