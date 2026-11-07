import { eventDay, isEventDay, isUuid } from "@/lib/domain/rules";
import type { FeedResponse } from "@/lib/domain/types";
import { requireStaff } from "@/lib/server/auth";
import { HttpError, json, route } from "@/lib/server/http";
import { currentFeedSeq } from "@/lib/server/live";
import { DEVICE_SELECT, mapDevice, menuItems, ordersForDay } from "@/lib/server/orders";

/** Authoritative snapshot for a tablet: today's orders (with names), full menu and this device's status. */
export const GET = route(async request => {
  const { db } = await requireStaff(request);
  const url = new URL(request.url);
  const day = url.searchParams.get("day") ?? eventDay();
  if (!isEventDay(day)) throw new HttpError(400, "INVALID_DAY", "Use YYYY-MM-DD.");
  const deviceId = url.searchParams.get("deviceId");
  const feedSeq = await currentFeedSeq(db);
  const [orders, menu, deviceRows] = [await ordersForDay(db, day), await menuItems(db, true),
    deviceId && isUuid(deviceId) ? await db.query<Record<string, unknown>>(`${DEVICE_SELECT} where id = $1`, [deviceId]) : []];
  const body: FeedResponse = { serverTime: new Date().toISOString(), day, orders, menu, device: deviceRows[0] ? mapDevice(deviceRows[0]) : null, feedSeq };
  return json(body);
});
