import { requireStaff } from "@/lib/server/auth";
import { json, readJson, route } from "@/lib/server/http";
import { resetOperationalData } from "@/lib/server/lead";

export const POST = route(async request => {
  const { db, staff } = await requireStaff(request, ["lead"]);
  return json(await resetOperationalData(db, staff, await readJson(request, 1_000)));
});
