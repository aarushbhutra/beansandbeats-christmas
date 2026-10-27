import "fake-indexeddb/auto";
import {test} from "node:test";
import assert from "node:assert/strict";
import {db} from "./offline/db";
import {enqueueMenuIntent,refreshCachedMenu} from "./offline/menu";
import {syncTablet} from "./offline/sync";
import {sampleMenu,sampleOrder} from "./fixtures";
test("menu intent is durable, protects pending edits on refresh, and acknowledges the menu revision",async()=>{
 const oldFetch=globalThis.fetch;
 try{
 Object.defineProperty(navigator,"onLine",{value:true,configurable:true});
 await db.devices.add({id:sampleOrder.deviceId,stationId:sampleOrder.stationId,prefix:"A",nextSequence:1,registeredAt:new Date().toISOString()});
 await db.menu.bulkPut(sampleMenu);
 const {id,revision,...original}=sampleMenu[0];const intent={kind:"updateMenu" as const,entityId:id,expectedRevision:revision,payload:{...original,priceCents:650}};
 const receipt=await enqueueMenuIntent(intent);assert.equal(receipt.state,"pending");
 assert.equal((await db.devices.toArray())[0].nextSequence,2);assert.equal((await db.menu.get(id))!.revision,revision);
 await assert.rejects(enqueueMenuIntent(intent),/pending change/);
 globalThis.fetch=async()=>Response.json({items:sampleMenu,revision,syncedAt:new Date().toISOString()});
 await refreshCachedMenu("test-session");assert.equal((await db.menu.get(id))!.priceCents,650);
 db.close();await db.open();assert.equal(await db.outbox.count(),1);
 globalThis.fetch=async(input,options)=>{
  if(String(input)==="/api/sync"){const op=JSON.parse(String(options?.body));assert.equal(op.operationId,receipt.operationId);return Response.json({results:[{operationId:op.operationId,outcome:"acknowledged",revision:2}],serverRevision:2});}
  if(String(input)==="/api/menu")return Response.json({items:[{...sampleMenu[0],priceCents:650,revision:2}],revision:2,syncedAt:new Date().toISOString()});
  return Response.json({orders:[]});
 };
 await syncTablet("test-session");assert.equal(await db.outbox.count(),0);assert.equal((await db.menu.get(id))!.revision,2);assert.equal(await db.orders.count(),0);
 }finally{globalThis.fetch=oldFetch;await db.delete();}
});
