import type { DeviceFreshness, SalesOrder } from "../../client/contracts";
import { apiError, requireLead, type StaffPrincipal } from "../menu";
import { calculateDailyReport, validateDay } from "./calculate";
import { reportCsv } from "./csv";

export interface ReportDependencies {
  authenticate(request: Request): Promise<StaffPrincipal | null>;
  /** Read orders and ALL registered-device sync watermarks in one consistent database snapshot. */
  readSnapshot(day: string): Promise<{ orders: readonly SalesOrder[]; devices: readonly DeviceFreshness[] }>;
  now?: () => Date;
}
export function createReportHandlers(deps: ReportDependencies) {
  const handle = (csv: boolean) => async (request: Request): Promise<Response> => {
    try {
      requireLead(await deps.authenticate(request));
      const day = validateDay(new URL(request.url).searchParams.get("day") ?? "");
      const snapshot = await deps.readSnapshot(day);
      const report = calculateDailyReport(snapshot.orders, day, snapshot.devices, deps.now?.() ?? new Date());
      const headers = { "Cache-Control": "private, no-store", Vary: "Cookie, Authorization" };
      if (!csv) return Response.json(report, { headers });
      return new Response(reportCsv(report), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="beans-and-beats-${day}.csv"`, "X-Reconciliation-Complete": String(report.reconciliation.complete), "X-Content-Type-Options": "nosniff" } });
    } catch (error) { return apiError(error); }
  };
  return { json: handle(false), csv: handle(true) };
}
