"use client";
import {tabletFetch} from "./network";
import {refreshCachedMenu} from "./menu";
import {db} from "./db";
import {eventDay} from "../domain";
import type {SyncResponse} from "../contracts";
let running=false;
export async function syncTablet(accessToken:string){
 if(navigator.locks)return navigator.locks.request("beansandbeats-sync",{ifAvailable:true},async lock=>{if(lock)await runSync(accessToken);});
 return runSync(accessToken);
}
async function runSync(accessToken:string){
 if(running||!navigator.onLine)return;running=true;
 try{
  const rows=(await db.outbox.toArray()).sort((a,b)=>a.operation.deviceSequence-b.operation.deviceSequence);
  for(const row of rows){
   if(row.state==="blocked")break;
   const response=await tabletFetch("/api/sync",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${accessToken}`},body:JSON.stringify(row.operation)});
   if(!response.ok)throw new Error(response.status===401?"Sign in again to sync":response.status===403?"This session cannot sync the next operation; sign in with the required staff role":"Sync unavailable; saved changes remain on this tablet");
   const body:SyncResponse=await response.json();const result=body.results[0];if(!result||result.operationId!==row.operationId)throw new Error("Invalid sync acknowledgement");
   if(result.outcome!=="acknowledged"){await db.outbox.update(row.operationId,{state:"blocked",message:result.message});break;}
   await db.transaction("rw",db.outbox,db.orders,db.menu,async()=>{if(row.operation.kind==="updateMenu"){const current=await db.menu.get(row.operation.entityId);if(current)await db.menu.update(current.id,{revision:Math.max(current.revision,result.revision)});}else{const current=await db.orders.get(row.operation.entityId);if(current)await db.orders.update(current.id,{revision:Math.max(current.revision,result.revision)});}await db.outbox.delete(row.operationId);});
  }
  await refreshCachedMenu(accessToken);
  const response=await tabletFetch(`/api/staff/orders?day=${eventDay()}`,{headers:{Authorization:`Bearer ${accessToken}`}});
  if(!response.ok)throw new Error("Queue refresh unavailable");
  const body=await response.json();
  await db.transaction("rw",db.orders,db.outbox,async()=>{const pending=new Set((await db.outbox.toArray()).map(r=>r.operation.entityId));for(const order of body.orders)if(!pending.has(order.id)){const current=await db.orders.get(order.id);if(!current||current.revision<=order.revision)await db.orders.put(order);}});
 }finally{running=false;}
}
