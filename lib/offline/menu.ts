"use client";
import {tabletFetch} from "./network";
import {db} from "./db";
import {toSharedMenuOperation} from "../client/shared-operation";
import type {MenuOperation,MenuResponse} from "../client/contracts";
export async function enqueueMenuIntent(intent:MenuOperation){
 const operationId=crypto.randomUUID();
 await db.transaction("rw",db.devices,db.menu,db.outbox,async()=>{
 const devices=await db.devices.toArray();if(devices.length!==1)throw new Error("Register this tablet first");
 if(await db.outbox.where("state").equals("blocked").count())throw new Error("Resolve blocked changes before editing menu");
 if(await db.outbox.filter(r=>r.operation.entityId===intent.entityId).count())throw new Error("This item already has a pending change");
 const device=devices[0];const current=await db.menu.get(intent.entityId);if(!current||current.revision!==intent.expectedRevision)throw new Error("Refresh the menu before editing this item");
 const operation=toSharedMenuOperation(intent,{operationId,deviceId:device.id,deviceSequence:device.nextSequence});
 await db.outbox.add({operationId,operation,state:"pending"});await db.menu.put(operation.payload);await db.devices.update(device.id,{nextSequence:device.nextSequence+1});
 });
 return {operationId,state:"pending" as const};
}
export async function refreshCachedMenu(token:string):Promise<MenuResponse>{
 const response=await tabletFetch("/api/menu",{cache:"no-store",headers:{Authorization:`Bearer ${token}`}});if(!response.ok)throw new Error("Menu unavailable");const body:MenuResponse=await response.json();
 await db.transaction("rw",db.menu,db.outbox,async()=>{const pending=new Set((await db.outbox.toArray()).filter(r=>r.operation.kind==="updateMenu").map(r=>r.operation.entityId));
 for(const item of await db.menu.toArray())if(!pending.has(item.id))await db.menu.delete(item.id);
 for(const item of body.items)if(!pending.has(item.id))await db.menu.put(item);
 });return body;
}
