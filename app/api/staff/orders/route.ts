import {requireStaff} from "@/lib/server/auth";
import {serverDatabase} from "@/lib/server/supabase";
import {configured,failure,json} from "@/lib/server/api";
import {orderColumns,mapOrder} from "@/lib/server/read";
export async function GET(request:Request){if(!configured())return failure("NOT_CONFIGURED","Configure the database first",503);
 const auth=await requireStaff(request);if(!auth.ok)return failure("AUTH_REQUIRED","Staff access required",auth.status);
 const day=new URL(request.url).searchParams.get("day");if(!day||!/^\d{4}-\d{2}-\d{2}$/.test(day))return failure("INVALID_DAY","Supply an SGT date",400);
 const {data,error}=await serverDatabase().from("orders").select(orderColumns).eq("event_day",day).order("server_sequence").limit(1000);
 if(error)return failure("READ_FAILED","Queue unavailable",503);return json({orders:data.map(mapOrder)});}
