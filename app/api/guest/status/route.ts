import {createHash} from "node:crypto";
import {serverDatabase} from "@/lib/server/supabase";
import {configured,failure,json} from "@/lib/server/api";
export async function GET(request:Request){if(!configured())return failure("NOT_CONFIGURED","Configure the database first",503);
 const token=request.headers.get("authorization")?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];if(!token)return failure("INVALID_TOKEN","Order access required",401);
 const {data,error}=await serverDatabase().from("orders").select("public_number,status,updated_at_server,order_items(name_snapshot,quantity,milk,temperature)").eq("tracking_token_hash",createHash("sha256").update(token).digest("hex")).single();
 if(error||!data)return failure("ORDER_UNAVAILABLE","Order is unavailable or not synced yet",404);
 return json({publicNumber:data.public_number,status:data.status,updatedAt:data.updated_at_server,items:data.order_items.map(i=>({nameSnapshot:i.name_snapshot,quantity:i.quantity,milk:i.milk,temperature:i.temperature}))});}
