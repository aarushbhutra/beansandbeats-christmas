import { isUuid } from "@/lib/domain/rules";
import { requireStaff } from "@/lib/server/auth";
import { HttpError, json, readJson, route } from "@/lib/server/http";
import { deviceAction } from "@/lib/server/lead";

export const POST = route<{ params: Promise<{ id: string }> }>(async (request, context) => {
  const { db, staff } = await requireStaff(request, ["lead"]);
  const { id } = await context.params;
  if (!isUuid(id)) throw new HttpError(400, "INVALID_ID", "Invalid tablet.");
  return json({ device: await deviceAction(db, staff, id, await readJson(request, 2_000)) });
});
