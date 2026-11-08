import { requireStaff } from "@/lib/server/auth";
import { json, readJson, route } from "@/lib/server/http";
import { allMenu, createMenuItem } from "@/lib/server/lead";

export const GET = route(async request => {
  const { db } = await requireStaff(request, ["lead"]);
  return json({ items: await allMenu(db) });
});

export const POST = route(async request => {
  const { db, staff } = await requireStaff(request, ["lead"]);
  return json({ item: await createMenuItem(db, staff, await readJson(request, 5_000)) }, { status: 201 });
});
