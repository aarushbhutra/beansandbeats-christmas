import { isUuid } from "@/lib/domain/rules";
import { requireStaff } from "@/lib/server/auth";
import { HttpError, json, route } from "@/lib/server/http";
import { resolveIssue } from "@/lib/server/lead";

export const POST = route<{ params: Promise<{ id: string }> }>(async (request, context) => {
  const { db, staff } = await requireStaff(request, ["lead"]);
  const { id } = await context.params;
  if (!isUuid(id)) throw new HttpError(400, "INVALID_ID", "Invalid issue.");
  await resolveIssue(db, staff, id);
  return json({ ok: true });
});
