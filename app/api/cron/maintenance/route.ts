import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/lib/server/db";
import { fail, json, route } from "@/lib/server/http";
import { purgeNames } from "@/lib/server/maintenance";

/** Vercel Cron calls this with "Authorization: Bearer $CRON_SECRET". */
export const GET = route(async request => {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) return fail(401, "UNAUTHORIZED", "Cron secret required.");
  return json(await purgeNames(await getDb()));
});
