import { requireStaff } from "@/lib/server/auth";
import { route } from "@/lib/server/http";
import { feedBus, sseStream } from "@/lib/server/live";

/** Change notifications for staff tablets; they pull /api/staff/feed on each event. */
export const GET = route(async request => {
  await requireStaff(request);
  return sseStream(request, send => feedBus.subscribe(seq => send("change", { seq })));
});
