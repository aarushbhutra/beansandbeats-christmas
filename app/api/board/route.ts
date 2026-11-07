import { getDb } from "@/lib/server/db";
import { json, route } from "@/lib/server/http";
import { readBoard } from "@/lib/server/public";

export const GET = route(async () => json(await readBoard(await getDb())));
