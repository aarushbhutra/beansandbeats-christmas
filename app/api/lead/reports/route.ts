import {reportResponse} from "@/lib/server/lead-routes";
export async function GET(request:Request){return reportResponse(request,false);}
