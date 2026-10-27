import "server-only";
import {serverDatabase} from "./supabase";
import {HandlerError,type MenuRepository} from "./menu";
import {mapOrder} from "./read";
import type {DeviceFreshness,SalesOrder} from "../client/contracts";
export const menuRepository:MenuRepository={
 async read(includeInactive){let query=serverDatabase().from("menu_items").select("id,name,price_cents,allowed_milk,allowed_temperatures,sold_out,active,revision").order("name");if(!includeInactive)query=query.eq("active",true);
 const {data,error}=await query;if(error)throw new HandlerError(503,"MENU_UNAVAILABLE","Menu is unavailable");
 return {items:data.map(m=>({id:m.id,name:m.name,priceCents:m.price_cents,allowedMilk:m.allowed_milk,allowedTemperatures:m.allowed_temperatures,soldOut:m.sold_out,active:m.active,revision:m.revision})),revision:Math.max(0,...data.map(m=>m.revision)),syncedAt:new Date().toISOString()};},
 async update(id,expectedRevision,change,actorId){const {data,error}=await serverDatabase().rpc("update_menu_item",{item_id:id,expected_revision:expectedRevision,change,actor:actorId});
 if(error?.message.includes("REVISION_CONFLICT"))return null;if(error)throw new HandlerError(503,"MENU_UNAVAILABLE","Menu update failed");return data;}
};
export async function readReportSnapshot(day:string,actor:string):Promise<{orders:SalesOrder[];devices:DeviceFreshness[]}>{
 const {data,error}=await serverDatabase().rpc("lead_report_snapshot",{report_day:day,actor});if(error)throw new HandlerError(503,"REPORT_UNAVAILABLE","Report snapshot unavailable");
 return {orders:data.orders.map(mapOrder),devices:data.devices};
}
