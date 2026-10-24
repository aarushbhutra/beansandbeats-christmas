import {serverDatabase} from "@/lib/server/supabase";
import {configured,failure,json} from "@/lib/server/api";
export async function GET(){if(!configured())return failure("NOT_CONFIGURED","Configure the database first",503);
 const {data,error}=await serverDatabase().from("menu_items").select("id,name,price_cents,allowed_milk,allowed_temperatures,sold_out,active,revision").eq("active",true);
 if(error)return failure("READ_FAILED","Menu unavailable",503);
 return json({items:data.map(m=>({id:m.id,name:m.name,priceCents:m.price_cents,allowedMilk:m.allowed_milk,allowedTemperatures:m.allowed_temperatures,soldOut:m.sold_out,active:m.active,revision:m.revision}))});}
