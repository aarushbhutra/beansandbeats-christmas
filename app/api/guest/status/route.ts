import { getDb } from "@/lib/server/db";
import { HttpError, json, route } from "@/lib/server/http";
import { bearer, readGuestStatus } from "@/lib/server/public";

export const GET = route(async request => {
  const status = await readGuestStatus(await getDb(), bearer(request));
  if (!status) throw new HttpError(404, "ORDER_NOT_FOUND", "We can't find this order yet. If you just ordered, the booth tablet may still be syncing.");
  return json(status);
});
