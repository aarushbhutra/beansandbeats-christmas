import {requireStaff} from "@/lib/server/auth";
import {configured,failure,json} from "@/lib/server/api";
export async function GET(request:Request){if(!configured())return failure("NOT_CONFIGURED","Configure the database first",503);const result=await requireStaff(request);if(!result.ok)return failure("AUTH_REQUIRED","Staff access required",result.status);return json({role:result.role});}
