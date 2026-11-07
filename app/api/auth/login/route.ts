import { z } from "zod";
import { clientIp, login, sessionCookie } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { HttpError, json, readJson, route } from "@/lib/server/http";

const input = z.object({ username: z.string().min(1).max(64), password: z.string().min(1).max(200) });

export const POST = route(async request => {
  const parsed = input.safeParse(await readJson(request, 2_000));
  if (!parsed.success) throw new HttpError(400, "INVALID_LOGIN", "Enter your username and password.");
  const db = await getDb();
  const session = await login(db, { ...parsed.data, ip: clientIp(request) });
  return json({ staff: session.staff, expiresAt: session.expiresAt }, { headers: { "Set-Cookie": sessionCookie(request, session.token, session.expiresAt) } });
});
