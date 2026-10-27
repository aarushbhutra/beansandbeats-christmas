import 'fake-indexeddb/auto';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {db} from './offline/db';
import {createLocalOrder,advanceLocalOrder} from './offline/queue';
import {syncTablet} from './offline/sync';
import {sampleMenu,sampleOrder} from './fixtures';
test('offline order chain replays through Supabase SQL exactly once after expiry and a lost acknowledgement',async()=>{
 const pg=new PGlite(),oldFetch=globalThis.fetch;
 try{
 Object.defineProperty(navigator,'onLine',{value:true,configurable:true});
 await pg.exec('create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key);');
 for(const file of ['202610250001_foundation.sql','202610260001_sync.sql','202610270001_lead_integration.sql'])await pg.exec(await readFile('supabase/migrations/'+file,'utf8'));
 const actor='00000000-0000-4000-8000-000000000009';
 await pg.query('insert into auth.users values ($1)',[actor]);await pg.query("insert into staff_memberships values ($1,'barista')",[actor]);
 await pg.exec(await readFile('supabase/seed.sql','utf8'));
 await pg.query("insert into devices(id,prefix,station_id,registered_by) values ($1,'A',$2,$3)",[sampleOrder.deviceId,sampleOrder.stationId,actor]);
 await db.devices.add({id:sampleOrder.deviceId,stationId:sampleOrder.stationId,prefix:'A',nextSequence:1,registeredAt:new Date().toISOString()});
 const {order}=await createLocalOrder('Alex',sampleOrder.items);
 for(const status of ['making','ready','collected'] as const)await advanceLocalOrder(order.id,status);
 globalThis.fetch=async()=>Response.json({error:{code:'AUTH_REQUIRED'}},{status:401});
 await assert.rejects(syncTablet('expired'),/Sign in again/);assert.equal(await db.outbox.count(),4);
 let loseAck=true;
 globalThis.fetch=async(input,init)=>{
  if(String(input)==='/api/sync'){
   const op=JSON.parse(String(init?.body));
   if(op.kind==='createOrder'){op.payload.trackingTokenHash=createHash('sha256').update(op.payload.trackingToken).digest('hex');delete op.payload.trackingToken;}
   const row=(await pg.query<{result:{revision:number}}>('select apply_queue_operation($1::jsonb,$2::uuid) as result',[JSON.stringify(op),actor])).rows[0];
   if(loseAck){loseAck=false;throw new TypeError('Lost response after database commit');}
   return Response.json({results:[row.result],serverRevision:row.result.revision});
  }
  if(String(input)==='/api/menu')return Response.json({items:sampleMenu,revision:1,syncedAt:new Date().toISOString()});
  return Response.json({orders:[]});
 };
 await assert.rejects(syncTablet('valid'),/Lost response/);assert.equal(await db.outbox.count(),4);
 await syncTablet('valid');assert.equal(await db.outbox.count(),0);
 const persisted=(await pg.query<{status:string;revision:number}>('select status,revision::int from orders')).rows;
 assert.deepEqual(persisted,[{status:'collected',revision:4}]);
 assert.equal((await pg.query<{n:number}>('select count(*)::int as n from sync_receipts')).rows[0].n,4);
 assert.equal((await db.orders.get(order.id))!.revision,4);
 }finally{globalThis.fetch=oldFetch;await db.delete();await pg.close();}
});
