import {configured} from "@/lib/server/api";
import {z} from "zod";
import {requireStaff} from "@/lib/server/auth";
import {serverDatabase} from "@/lib/server/supabase";
const input = z.object({prefix:z.string().regex(/^[A-Z]{1,4}$/),stationId:z.uuid()}).strict();
export async function POST(request: Request) {
 if (!configured()) return Response.json({error:{code:"NOT_CONFIGURED",message:"Database setup is required"}},{status:503});
 const auth = await requireStaff(request,["booth_lead"]);
 if (!auth.ok) return Response.json({error:{code:"UNAUTHORIZED",message:"Booth-lead access required"}},{status:auth.status});
 const parsed = input.safeParse(await request.json().catch(()=>null));
 if (!parsed.success) return Response.json({error:{code:"INVALID_INPUT",message:"Provide an uppercase device prefix and valid station ID"}},{status:400});
 const {data,error} = await serverDatabase().from("devices").insert({prefix:parsed.data.prefix,station_id:parsed.data.stationId,registered_by:auth.userId}).select("id,prefix,station_id,next_sequence,registered_at").single();
 if (error) return Response.json({error:{code:error.code === "23505" ? "PREFIX_EXISTS":"REGISTRATION_FAILED",message:"Unable to register device; confirm station and unused prefix"}},{status:error.code === "23505" ? 409:400});
 return Response.json({id:data.id,prefix:data.prefix,stationId:data.station_id,nextSequence:data.next_sequence,registeredAt:data.registered_at},{status:201});
}
