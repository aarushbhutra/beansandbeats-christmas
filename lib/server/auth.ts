import "server-only";
import type {Role} from "../contracts";
import {serverDatabase} from "./supabase";
export async function requireStaff(request: Request, allowed: Role[] = ["barista","booth_lead"]) {
 const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
 if (!token) return {ok:false as const,status:401};
 const db = serverDatabase();
 const {data,error} = await db.auth.getUser(token);
 if (error || !data.user) return {ok:false as const,status:401};
 const membership = await db.from("staff_memberships").select("role").eq("user_id",data.user.id).single();
 if (membership.error || !allowed.includes(membership.data.role as Role)) return {ok:false as const,status:403};
 return {ok:true as const,userId:data.user.id,role:membership.data.role as Role};
}
