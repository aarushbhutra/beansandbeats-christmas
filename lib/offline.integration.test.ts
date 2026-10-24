import "fake-indexeddb/auto";
import {test} from "node:test";
import assert from "node:assert/strict";
import {db} from "./offline/db";
import {createLocalOrder,advanceLocalOrder} from "./offline/queue";
import {sampleOrder} from "./fixtures";

test("concurrent local saves allocate unique counters and atomically retain outbox and QR",async()=>{
 try{
 await db.devices.add({id:sampleOrder.deviceId,stationId:sampleOrder.stationId,prefix:"A",nextSequence:1,registeredAt:new Date().toISOString()});
 const results=await Promise.all([createLocalOrder("Alex",sampleOrder.items),createLocalOrder("Sam",sampleOrder.items)]);
 assert.notEqual(results[0].order.publicNumber,results[1].order.publicNumber);
 assert.equal(await db.orders.count(),2);assert.equal(await db.outbox.count(),2);assert.equal(await db.tickets.count(),2);
 assert.equal((await db.devices.toArray())[0].nextSequence,3);
 await assert.rejects(advanceLocalOrder(results[0].order.id,"making"),/Sync the previous/);
 await assert.rejects(createLocalOrder("",sampleOrder.items));assert.equal((await db.devices.toArray())[0].nextSequence,3);
 db.close();await db.open();assert.equal(await db.orders.count(),2);assert.equal(await db.outbox.count(),2);
 }finally{await db.delete();}
});
