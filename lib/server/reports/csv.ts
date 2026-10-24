import type { DailyReport } from "../../client/contracts";

/** Quote fields and stop spreadsheet formula evaluation, including control/whitespace prefixes. */
export function csvText(value: string): string {
  const safe = /^[\s\u0000-\u001f\u007f]*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
export function reportCsv(report: DailyReport): string {
  // Exact v1 column order and integer-cent units from Person 1's published handoff.
  const header = "eventDay,publicNumber,item,milk,temperature,quantity,unitPriceCents,lineTotalCents,status";
  return "\uFEFF" + [header, ...report.rows.map(line => [csvText(line.eventDay), csvText(line.publicNumber), csvText(line.item), csvText(line.milk), csvText(line.temperature), line.quantity, line.unitPriceCents, line.lineTotalCents, csvText(line.status)].join(","))].join("\r\n") + "\r\n";
}
