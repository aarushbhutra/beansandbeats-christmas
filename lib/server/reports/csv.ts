import type { DailyReport } from "../../client/contracts";

/** Quote fields and stop spreadsheet formula evaluation, including control/whitespace prefixes. */
export function csvText(value: string): string {
  const safe = /^[\s\u0000-\u001f\u007f]*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
function decimal(cents: number): string { return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`; }
export function reportCsv(report: DailyReport): string {
  const header = "sgt_day,order_number,item,milk,temperature,quantity,unit_price_sgd,line_total_sgd,status,included_in_totals,reconciliation_complete";
  return "\uFEFF" + [header, ...report.lines.map(line => [csvText(line.day), csvText(line.orderNumber), csvText(line.item), csvText(line.milk), csvText(line.temperature), line.quantity, decimal(line.unitPriceCents), decimal(line.lineTotalCents), csvText(line.status), line.status !== "cancelled" ? "true" : "false", report.reconciliation.complete ? "true" : "false"].join(","))].join("\r\n") + "\r\n";
}
