import {createHash} from "node:crypto";
import {validateMenuChange,apiError} from "@/lib/server/menu";
import {operationSchema} from "@/lib/validation";
import {requireStaff} from "@/lib/server/auth";
import {serverDatabase} from "@/lib/server/supabase";
import {configured,failure,json} from "@/lib/server/api";
export async function POST(request:Request){
 if(!configured()) return failure("NOT_CONFIGURED","Configure the database first",503);
 const auth=await requireStaff(request); if(!auth.ok)return failure("AUTH_REQUIRED","Staff access required",auth.status);
 const raw=await request.text(); if(raw.length>100000)return failure("TOO_LARGE","Operation too large",413);
 const parsed=operationSchema.safeParse((()=>{try{return JSON.parse(raw)}catch{return null}})());
 if(!parsed.success)return failure("INVALID_OPERATION","Check operation fields",400);
 const op=parsed.data;
 if(op.kind==="updateMenu"){if(auth.role!=="booth_lead")return failure("FORBIDDEN","Booth lead access required",403);try{const {id,revision,...change}=op.payload;if(id!==op.entityId||revision!==op.expectedRevision)return failure("INVALID_MENU","Menu identity or revision mismatch",400);validateMenuChange(change);}catch(e){return apiError(e);}}
 const secured=op.kind==="createOrder"?{...op,payload:{order:op.payload.order,trackingTokenHash:createHash("sha256").update(op.payload.trackingToken).digest("hex")}}:op;
 const {data,error}=await serverDatabase().rpc("apply_queue_operation",{op:secured,actor:auth.userId});
 if(error && !["P0001","23505","23514"].includes(error.code))return failure("SYNC_UNAVAILABLE","Sync is temporarily unavailable; local operations are retained",503);
 if(error) return json({results:[{operationId:op.operationId,outcome:"conflict",code:"SYNC_CONFLICT",message:"Server could not apply this operation. Refresh authoritative data and ask the booth lead to reconcile; later operations on this tablet are paused."}],serverRevision:0});
 return json({results:[data],serverRevision:data.revision});
}
