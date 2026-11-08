import { isUuid } from "@/lib/domain/rules";
import { requireStaff } from "@/lib/server/auth";
import { HttpError, json, readJson, route } from "@/lib/server/http";
import { updateStaff } from "@/lib/server/lead";

export const PATCH = route<{ params: Promise<{ id: string }> }>(async (request, context) => {
  const { db, staff } = await requireStaff(request, ["lead"]);
  const { id } = await context.params;
  if (!isUuid(id)) throw new HttpError(400, "INVALID_ID", "Invalid account.");
  await updateStaff(db, staff, id, await readJson(request, 2_000));
  return json({ ok: true });
});
