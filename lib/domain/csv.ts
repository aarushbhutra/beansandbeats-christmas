import { formatSgtTime } from "./rules";
import type { DailyReport } from "./types";

export const CSV_COLUMNS = ["eventDay", "publicNumber", "orderedAtSgt", "item", "milk", "temperature", "quantity", "unitPriceCents", "lineTotalCents", "status", "flags"] as const;

/** Quote every text field and neutralise spreadsheet formulas, including whitespace/control prefixes. */
export function csvText(value: string): string {
  const risky = /^[\s\u0000-\u001f\u007f]*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value);
  return `"${(risky ? `'${value}` : value).replace(/"/g, '""')}"`;
}

export function reportCsv(report: DailyReport): string {
  const lines = report.rows.map(row => [
    csvText(row.eventDay), csvText(row.publicNumber), csvText(formatSgtTime(row.orderedAt, true)), csvText(row.item), csvText(row.milk),
    csvText(row.temperature), row.quantity, row.unitPriceCents, row.lineTotalCents, csvText(row.status), csvText(row.flags),
  ].join(","));
  return "﻿" + [CSV_COLUMNS.join(","), ...lines].join("\r\n") + "\r\n";
}
