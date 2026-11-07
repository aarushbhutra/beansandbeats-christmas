import { eventDay } from "@/lib/domain/rules";
import { requireStaff } from "@/lib/server/auth";
import { json, route } from "@/lib/server/http";
import { deviceOverview, liveStats } from "@/lib/server/lead";

export const GET = route(async request => {
  const { db } = await requireStaff(request, ["lead"]);
  const day = eventDay();
  const [stats, overview] = [await liveStats(db, day), await deviceOverview(db)];
  return json({ day, stats, ...overview, storage: db.storage, serverTime: new Date().toISOString() });
});
