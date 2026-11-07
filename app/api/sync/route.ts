import { requireStaff } from "@/lib/server/auth";
import { json, readJson, route } from "@/lib/server/http";
import { applySync } from "@/lib/server/sync";

export const POST = route(async request => {
  const { db, staff } = await requireStaff(request);
  return json(await applySync(db, staff, await readJson(request, 500_000)));
});
