import { getDb, storageModeFromEnv } from "@/lib/server/db";
import { json } from "@/lib/server/http";

export async function GET() {
  try {
    const db = await getDb();
    await db.query("select 1");
    return json({ ok: true, storage: db.storage, serverTime: new Date().toISOString() });
  } catch {
    return json({ ok: false, storage: storageModeFromEnv(), serverTime: new Date().toISOString() }, { status: 503 });
  }
}
