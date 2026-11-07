import { eventDay, isEventDay } from "@/lib/domain/rules";
import { requireStaff } from "@/lib/server/auth";
import { HttpError, json, route } from "@/lib/server/http";
import { dailyReport } from "@/lib/server/lead";

export const GET = route(async request => {
  const { db } = await requireStaff(request, ["lead"]);
  const day = new URL(request.url).searchParams.get("day") ?? eventDay();
  if (!isEventDay(day)) throw new HttpError(400, "INVALID_DAY", "Use YYYY-MM-DD.");
  return json(await dailyReport(db, day));
});
