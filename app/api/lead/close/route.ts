import { eventDay, isEventDay } from "@/lib/domain/rules";
import { requireStaff } from "@/lib/server/auth";
import { HttpError, json, readJson, route } from "@/lib/server/http";
import { closeDay } from "@/lib/server/lead";

export const POST = route(async request => {
  const { db, staff } = await requireStaff(request, ["lead"]);
  const day = new URL(request.url).searchParams.get("day") ?? eventDay();
  if (!isEventDay(day)) throw new HttpError(400, "INVALID_DAY", "Use YYYY-MM-DD.");
  return json(await closeDay(db, staff, day, await readJson(request, 2_000)));
});
