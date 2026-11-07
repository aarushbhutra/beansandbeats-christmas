import { requireStaff } from "@/lib/server/auth";
import { json, readJson, route } from "@/lib/server/http";
import { deviceOverview, registerDevice } from "@/lib/server/lead";

export const GET = route(async request => {
  const { db } = await requireStaff(request, ["lead"]);
  return json(await deviceOverview(db));
});

/** Registers the calling tablet and returns its identity; the tablet stores it in IndexedDB. */
export const POST = route(async request => {
  const { db, staff } = await requireStaff(request, ["lead"]);
  return json({ device: await registerDevice(db, staff, await readJson(request, 2_000)) }, { status: 201 });
});
