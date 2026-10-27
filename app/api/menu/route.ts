import {createMenuHandlers} from "@/lib/server/menu";
import {authenticateSharedStaff} from "@/lib/server/menu/shared-auth";
import {menuRepository} from "@/lib/server/lead-repository";
import {configured,failure} from "@/lib/server/api";
export async function GET(request:Request){if(!configured())return failure("NOT_CONFIGURED","Configure the database first",503);return createMenuHandlers({authenticate:authenticateSharedStaff,repository:menuRepository}).get(request);}
