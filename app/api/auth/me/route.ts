import { requireStaff } from "@/lib/server/auth";
import { json, route } from "@/lib/server/http";

export const GET = route(async request => {
  const { staff, db } = await requireStaff(request);
  return json({ staff: { id: staff.id, username: staff.username, displayName: staff.displayName, role: staff.role }, expiresAt: staff.expiresAt, storage: db.storage });
});
