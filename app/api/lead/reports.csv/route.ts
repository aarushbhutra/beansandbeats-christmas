import { reportCsv } from "@/lib/domain/csv";
import { eventDay, isEventDay } from "@/lib/domain/rules";
import { audit, requireStaff } from "@/lib/server/auth";
import { HttpError, route } from "@/lib/server/http";
import { dailyReport } from "@/lib/server/lead";

export const GET = route(async request => {
  const { db, staff } = await requireStaff(request, ["lead"]);
  const day = new URL(request.url).searchParams.get("day") ?? eventDay();
  if (!isEventDay(day)) throw new HttpError(400, "INVALID_DAY", "Use YYYY-MM-DD.");
  const report = await dailyReport(db, day);
  await audit(db, staff.id, "report.export", day, { rows: report.rows.length, complete: report.reconciliation.complete });
  const suffix = report.reconciliation.complete ? "" : "-provisional";
  return new Response(reportCsv(report), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="beansandbeats-${day}${suffix}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Reconciliation-Complete": String(report.reconciliation.complete),
    },
  });
});
