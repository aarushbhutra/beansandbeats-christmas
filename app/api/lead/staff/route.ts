import { requireStaff } from "@/lib/server/auth";
import { json, readJson, route } from "@/lib/server/http";
import { createStaff, listStaff } from "@/lib/server/lead";

export const GET = route(async request => {
  const { db } = await requireStaff(request, ["lead"]);
  return json({ staff: await listStaff(db) });
});

export const POST = route(async request => {
  const { db, staff } = await requireStaff(request, ["lead"]);
  return json(await createStaff(db, staff, await readJson(request, 2_000)), { status: 201 });
});
