import "server-only";
import {createReportHandlers} from "./reports";
import {authenticateSharedStaff} from "./menu/shared-auth";
import {readReportSnapshot} from "./lead-repository";
import {configured,failure} from "./api";
export async function reportResponse(request:Request,csv:boolean){
 if(!configured())return failure("NOT_CONFIGURED","Configure the database first",503);
 let actor:Awaited<ReturnType<typeof authenticateSharedStaff>>;
 const handlers=createReportHandlers({authenticate:async r=>(actor=await authenticateSharedStaff(r)),readSnapshot:day=>readReportSnapshot(day,actor!.id)});
 return csv?handlers.csv(request):handlers.json(request);
}
