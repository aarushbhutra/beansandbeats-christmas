import { clearSessionCookie, logout } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { json, route } from "@/lib/server/http";

export const POST = route(async request => {
  await logout(await getDb(), request);
  return json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookie(request) } });
});
