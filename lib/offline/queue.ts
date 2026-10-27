"use client";
import {db} from "./db";
import {eventDay,publicNumber,totalCents,canTransition} from "../domain";
import type {Order,OrderItem,OrderStatus} from "../contracts";
export async function createLocalOrder(firstName:string,items:OrderItem[]){
 const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,"0")).join("");
 const id=crypto.randomUUID(); const operationId=crypto.randomUUID();
 return db.transaction("rw",db.devices,db.orders,db.outbox,db.tickets,async()=>{
  const devices=await db.devices.toArray();if(devices.length!==1)throw new Error("Register exactly one device for this tablet first");
  if(await db.outbox.where("state").equals("blocked").count())throw new Error("Resolve the blocked sync operation before taking more orders");
  const device=devices[0];const seq=device.nextSequence;const day=eventDay();
  if(!firstName.trim()||firstName.trim().length>60||!items.length)throw new Error("Enter a first name and choose a drink");
  const order:Order={id,publicNumber:publicNumber(day,device.prefix,seq),stationId:device.stationId,deviceId:device.id,deviceSequence:seq,eventDay:day,firstName:firstName.trim(),items,totalCents:totalCents(items),status:"queued",revision:0,createdAtDevice:new Date().toISOString(),receivedAtServer:null,updatedAtServer:null};
  await db.orders.add(order);
  await db.tickets.add({id,token});
  await db.outbox.add({operationId,operation:{operationId,deviceId:device.id,deviceSequence:seq,entityId:id,expectedRevision:0,kind:"createOrder",payload:{order,trackingToken:token}},state:"pending"});
  await db.devices.update(device.id,{nextSequence:seq+1});
  return {order,token};
 });
}
export async function advanceLocalOrder(id:string,target:OrderStatus,reason?:string){
 await db.transaction("rw",db.devices,db.orders,db.outbox,async()=>{
  const [device]=await db.devices.toArray();const order=await db.orders.get(id);
  if(!device||!order||!canTransition(order.status,target))throw new Error("Invalid transition or unregistered tablet");
  if(await db.outbox.where("state").equals("blocked").count())throw new Error("Resolve the blocked sync operation before continuing");
  const earlier=await db.outbox.filter(r=>r.operation.entityId===id).toArray();
  const expectedRevision=Math.max(order.revision,...earlier.map(r=>r.operation.kind==="createOrder"?1:r.operation.expectedRevision+1));
  if(target==="cancelled"&&!reason?.trim())throw new Error("Provide a cancellation reason");
  const operationId=crypto.randomUUID();const base={operationId,deviceId:device.id,deviceSequence:device.nextSequence,entityId:id,expectedRevision};
  const operation=target==="cancelled"?{...base,kind:"cancelOrder" as const,payload:{reason:reason!}}:{...base,kind:"advanceOrder" as const,payload:{status:target as "making"|"ready"|"collected"}};
  await db.outbox.add({operationId,operation,state:"pending"});await db.orders.update(id,{status:target});await db.devices.update(device.id,{nextSequence:device.nextSequence+1});
 });
}
