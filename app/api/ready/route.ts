import {serverDatabase} from "@/lib/server/supabase";
import {configured,failure,json} from "@/lib/server/api";
import {eventDay} from "@/lib/domain";
export async function GET(){if(!configured())return failure("NOT_CONFIGURED","Configure the database first",503);
 const {data,error}=await serverDatabase().from("orders").select("first_name,public_number").eq("event_day",eventDay()).eq("status","ready").order("server_sequence").limit(200);
 if(error)return failure("READ_FAILED","Board unavailable",503);return json({orders:data.map(o=>({firstName:o.first_name,publicNumber:o.public_number})),updatedAt:new Date().toISOString()});}
