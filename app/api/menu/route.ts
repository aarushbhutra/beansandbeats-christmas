import { getDb } from "@/lib/server/db";
import { json, route } from "@/lib/server/http";
import { menuItems } from "@/lib/server/orders";

/** Public, active menu only. */
export const GET = route(async () => json({ items: await menuItems(await getDb(), false), serverTime: new Date().toISOString() }));
