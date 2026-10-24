import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
import {sampleOperation,sampleOrder} from "./fixtures";
import {operationSchema} from "./validation";

test("database migration, atomic sync receipts, revision conflicts and immutable snapshots",async()=>{
 const db=new PGlite();
 try{
 await db.exec("create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key);");
 for(const f of ["202610250001_foundation.sql","202610260001_sync.sql"])await db.exec(await readFile(`supabase/migrations/${f}`,"utf8"));
 const actor="00000000-0000-4000-8000-000000000009";
 await db.query("insert into auth.users values ($1)",[actor]);
 await db.query("insert into staff_memberships values ($1,'barista')",[actor]);
 await db.query("insert into stations values ($1,'Test')",[sampleOrder.stationId]);
 await db.query("insert into devices(id,prefix,station_id,registered_by) values ($1,'A',$2,$3)",[sampleOrder.deviceId,sampleOrder.stationId,actor]);
 await db.query("insert into menu_items(id,name,price_cents,allowed_milk,allowed_temperatures) values ($1,'Sample Latte',550,array['oat'],array['iced'])",[sampleOrder.items[0].menuItemId]);
 const secured={...sampleOperation,payload:{order:sampleOrder,trackingTokenHash:'a'.repeat(64)}};
 const apply=async(op:unknown)=>(await db.query<{result:{revision:number}}>("select apply_queue_operation($1::jsonb,$2::uuid) as result",[JSON.stringify(op),actor])).rows[0].result;
 assert.equal((await apply(secured)).revision,1);
 assert.deepEqual(await apply(secured),await apply(secured));
 assert.equal((await db.query<{count:number}>("select count(*)::int as count from orders")).rows[0].count,1);
 assert.equal((await db.query<{count:number}>("select count(*)::int as count from order_items")).rows[0].count,1);
 const change={...sampleOperation,operationId:crypto.randomUUID(),deviceSequence:2,expectedRevision:1,kind:"advanceOrder",payload:{status:"making"}};
 assert.equal((await apply(change)).revision,2);
 await assert.rejects(apply({...change,operationId:crypto.randomUUID(),deviceSequence:3}),/REVISION_CONFLICT/);
 assert.equal((await apply({...change,operationId:crypto.randomUUID(),deviceSequence:3,expectedRevision:2,payload:{status:"ready"}})).revision,3);
 await assert.rejects(db.exec("update order_items set unit_price_cents_snapshot=1"),/immutable/);
 const bad={...secured,operationId:crypto.randomUUID(),deviceSequence:4,payload:{...secured.payload,order:{...sampleOrder,id:crypto.randomUUID(),deviceSequence:4,publicNumber:'1126-A-004',totalCents:1}}};bad.entityId=bad.payload.order.id;
 await assert.rejects(apply(bad),/TOTAL_INVALID/);
 assert.equal((await db.query<{seq:number}>("select next_sequence::int as seq from devices")).rows[0].seq,4);
 }finally{await db.close();}
});
test("sync input rejects forged terminal create and weak tracking tokens",()=>{
 const valid={...sampleOperation,payload:{...sampleOperation.payload,trackingToken:"a".repeat(64)}};
 assert.equal(operationSchema.safeParse(valid).success,true);
 assert.equal(operationSchema.safeParse({...valid,payload:{...valid.payload,order:{...sampleOrder,status:"collected"}}}).success,false);
 assert.equal(operationSchema.safeParse(sampleOperation).success,false);
});
