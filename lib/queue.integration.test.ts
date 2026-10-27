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
 for(const f of ["202610250001_foundation.sql","202610260001_sync.sql","202610270001_lead_integration.sql"])await db.exec(await readFile(`supabase/migrations/${f}`,"utf8"));
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
 const menuOp={operationId:crypto.randomUUID(),deviceId:sampleOrder.deviceId,deviceSequence:4,entityId:sampleOrder.items[0].menuItemId,expectedRevision:1,kind:"updateMenu",payload:{id:sampleOrder.items[0].menuItemId,revision:1,name:"Updated Latte",priceCents:600,allowedMilk:["oat"],allowedTemperatures:["iced"],soldOut:false,active:true}};
 await assert.rejects(apply(menuOp),/LEAD_REQUIRED/);
 await db.query("update staff_memberships set role='booth_lead' where user_id=$1",[actor]);
 assert.equal((await apply(menuOp)).revision,2);assert.equal((await apply(menuOp)).revision,2);
 assert.equal((await db.query<{price:number}>("select unit_price_cents_snapshot as price from order_items")).rows[0].price,550);
 const snapshot=(await db.query<{snapshot:{orders:any[];devices:any[]}}>("select lead_report_snapshot('2026-11-26',$1) as snapshot",[actor])).rows[0].snapshot;
 assert.equal(snapshot.orders.length,1);assert.equal(snapshot.orders[0].total_cents,1100);assert.equal(snapshot.devices[0].pendingOperations,null);
 assert.equal('tracking_token_hash' in snapshot.orders[0],false);assert.equal('first_name' in snapshot.orders[0],false);
 await assert.rejects(db.query("select update_menu_item($1,1,$2::jsonb,$3)",[menuOp.entityId,JSON.stringify(menuOp.payload),actor]),/REVISION_CONFLICT/);
 await db.query("update staff_memberships set role='barista' where user_id=$1",[actor]);
 await assert.rejects(db.query("select lead_report_snapshot('2026-11-26',$1)",[actor]),/LEAD_REQUIRED/);
 }finally{await db.close();}
});
test("sync input rejects forged terminal create and weak tracking tokens",()=>{
 const valid={...sampleOperation,payload:{...sampleOperation.payload,trackingToken:"a".repeat(64)}};
 assert.equal(operationSchema.safeParse(valid).success,true);
 assert.equal(operationSchema.safeParse({...valid,payload:{...valid.payload,order:{...sampleOrder,status:"collected"}}}).success,false);
 assert.equal(operationSchema.safeParse(sampleOperation).success,false);
});
