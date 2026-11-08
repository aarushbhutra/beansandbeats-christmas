"use client";
import { ChevronLeft, ChevronRight, Download, Lock, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { cx, Modal, Notice, Spinner, Stat, useToast } from "@/components/ui/ui";
import { ApiError, post } from "@/lib/client/api";
import { useApi } from "@/lib/client/use-api";
import { eventDay, formatDayLabel, formatMoney, formatSgtTime, shiftDay } from "@/lib/domain/rules";
import type { DailyReport } from "@/lib/domain/types";

const seconds = (s: number | null) => (s === null ? "—" : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`);

export default function ReportsPage() {
  const [day, setDay] = useState(eventDay());
  const { data: report, error, loading, setData } = useApi<DailyReport>(`/api/lead/reports?day=${day}`);
  const [closing, setClosing] = useState(false);
  const current = report?.day === day ? report : null;
  return (
    <div className="grid gap-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-mute">booth lead · daily report · sgt</p>
          <h1 className="h-display mt-1 text-[2.6rem]">{formatDayLabel(day)}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex border border-ink">
            <button className="grid w-11 place-items-center hover:bg-ink hover:text-paper" onClick={() => setDay(shiftDay(day, -1))} aria-label="Previous day"><ChevronLeft className="h-4 w-4" /></button>
            <input type="date" className="border-x-[1.5px] border-ink px-3 text-sm" value={day} max={eventDay()} onChange={e => e.target.value && setDay(e.target.value)} aria-label="Event day" />
            <button className="grid w-11 place-items-center hover:bg-ink hover:text-paper disabled:opacity-30" onClick={() => setDay(shiftDay(day, 1))} disabled={day >= eventDay()} aria-label="Next day"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <a className={cx("btn btn-outline", !current && "pointer-events-none opacity-40")} href={`/api/lead/reports.csv?day=${day}`}><Download className="h-4 w-4" /> csv{current && !current.reconciliation.complete ? " (provisional)" : ""}</a>
          <button className="btn btn-solid" disabled={!current} onClick={() => setClosing(true)}><Lock className="h-4 w-4" /> {current?.closure ? "re-close day" : "close day"}</button>
        </div>
      </div>

      {error && <Notice tone="note">{error.status === 0 ? "Reports need a connection. They only count orders the server has received." : error.message}</Notice>}
      {loading && !current && <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map(i => <div key={i} className="skeleton h-32" />)}</div>}

      {current && (
        <>
          {current.closure && <Notice tone="ok"><b>closed</b> by {current.closure.closedBy} at {formatSgtTime(current.closure.closedAt)} sgt. Late syncs still appear below; re-close to update the record.</Notice>}
          {current.reconciliation.complete ? (
            <Notice tone="ok"><b>reconciled.</b> Every tablet has reported an empty outbox and all orders are collected or cancelled.</Notice>
          ) : (
            <div className="border border-ink bg-paper p-4" role="alert">
              <div className="flex items-center gap-2 font-bold"><TriangleAlert className="h-4 w-4 text-ink" /> provisional: {current.reconciliation.warnings.length} thing{current.reconciliation.warnings.length === 1 ? "" : "s"} to reconcile</div>
              <ul className="mt-2 grid gap-1 text-sm">{current.reconciliation.warnings.map(w => <li key={w}>· {w}</li>)}</ul>
            </div>
          )}

          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat dark label="cups" value={current.cups} hint={`${current.orders} orders`} />
            <Stat label="recorded value" value={formatMoney(current.totalCents)} hint={`avg ${formatMoney(current.averageOrderCents)} / order`} />
            <Stat label="ready in (median)" value={seconds(current.prep.medianSeconds)} hint={`p90 ${seconds(current.prep.p90Seconds)} · ${current.prep.samples} orders`} />
            <Stat label="cancelled" value={current.cancelledOrders} hint={`${current.cancelledCups} cups · ${formatMoney(current.cancelledTotalCents)} excluded`} />
          </section>

          <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <section className="border border-line p-5">
              <h2 className="h-title text-2xl">cups by hour</h2>
              <p className="mt-1 text-xs text-mute">by order time, sgt · cancelled excluded</p>
              <HourlyChart rows={current.hourly} />
            </section>
            <section className="border border-line p-5">
              <h2 className="h-title text-2xl">top drinks</h2>
              <p className="mt-1 text-xs text-mute">cups sold · cancelled excluded</p>
              <BarList rows={current.topItems.slice(0, 8).map(i => ({ label: i.name, value: i.cups, detail: formatMoney(i.totalCents) }))} />
              <div className="mt-6 grid grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm text-mute">milk</h3>
                  <BarList compact rows={current.milk.map(m => ({ label: m.name, value: m.cups }))} />
                </div>
                <div>
                  <h3 className="text-sm text-mute">hot vs iced</h3>
                  <BarList compact rows={[{ label: "hot", value: current.temperature.hot }, { label: "iced", value: current.temperature.iced }]} />
                </div>
              </div>
            </section>
          </div>

          <section>
            <div className="flex items-baseline justify-between">
              <h2 className="h-title text-3xl">every drink</h2>
              <span className="text-xs text-mute">{current.rows.length} lines · generated {formatSgtTime(current.generatedAt, true)} sgt</span>
            </div>
            <p className="mt-1 text-xs text-mute">{current.definition} The csv has the same rows. No names or tracking tokens are exported.</p>
            {current.rows.length ? (
              <div className="mt-3 overflow-x-auto border border-ink scroll-thin">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-ink text-xs text-paper">
                    <tr>{["order", "time", "drink", "milk · temp", "qty", "unit", "line", "status"].map(h => <th key={h} className={cx("px-3 py-2.5 font-medium", ["qty", "unit", "line"].includes(h) && "text-right")}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {current.rows.map((row, i) => (
                      <tr key={`${row.publicNumber}-${i}`} className={cx("border-t border-line", row.status === "cancelled" && "text-dim line-through decoration-1", row.flags && "bg-wash")}>
                        <td className="px-3 py-2 font-bold">{row.publicNumber}</td>
                        <td className="px-3 py-2 text-xs">{formatSgtTime(row.orderedAt)}</td>
                        <td className="px-3 py-2 font-semibold">{row.item}{row.flags && <span className="ml-2 tag text-ink no-underline">{row.flags.replace(/_/g, " ")}</span>}</td>
                        <td className="px-3 py-2 text-mute">{row.milk} · {row.temperature}</td>
                        <td className="px-3 py-2 text-right tabular">{row.quantity}</td>
                        <td className="px-3 py-2 text-right tabular">{formatMoney(row.unitPriceCents)}</td>
                        <td className="px-3 py-2 text-right font-bold tabular">{formatMoney(row.lineTotalCents)}</td>
                        <td className="px-3 py-2"><span className="tag text-mute">{row.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="mt-6 border border-dashed border-line p-10 text-center text-mute">no orders recorded for this day yet.</p>}
          </section>
        </>
      )}

      <CloseDay open={closing} report={current} onClose={() => setClosing(false)} onClosed={r => { setData(r); setClosing(false); }} />
    </div>
  );
}

function HourlyChart({ rows }: { rows: DailyReport["hourly"] }) {
  if (!rows.length) return <p className="py-16 text-center text-sm text-mute">no sales yet.</p>;
  let first = Math.min(...rows.map(r => r.hour)), last = Math.max(...rows.map(r => r.hour));
  // Keep a readable window of at least 10 hours so one busy hour isn't one giant slab.
  while (last - first < 9) { if (first > 0) first--; if (last - first < 9 && last < 23) last++; }
  const hours = Array.from({ length: last - first + 1 }, (_, i) => first + i).map(hour => rows.find(r => r.hour === hour) ?? { hour, cups: 0, totalCents: 0 });
  const max = Math.max(...hours.map(h => h.cups), 1);
  const peak = hours.reduce((a, b) => (b.cups > a.cups ? b : a));
  return (
    <figure aria-label="Cups by hour">
      <div className="relative mt-6 flex h-56 items-end gap-[2px] border-b border-ink">
        {[0.5].map(f => <div key={f} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-line" style={{ bottom: `${f * 100}%` }}><span className="absolute -top-2.5 left-0 bg-paper pr-1 text-[0.65rem] text-mute">{Math.round(max * f)}</span></div>)}
        {hours.map(h => (
          <div key={h.hour} className="group relative flex h-full flex-1 items-end">
            <div className={cx("w-full rounded-t-[4px] transition-colors", h === peak ? "bg-ink" : "bg-ink group-hover:bg-ink")} style={{ height: `${(h.cups / max) * 100}%`, minHeight: h.cups ? 3 : 0 }} />
            {h === peak && <span className="absolute left-1/2 -translate-x-1/2 text-xs font-bold" style={{ bottom: `calc(${(h.cups / max) * 100}% + 4px)` }}>{h.cups}</span>}
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap bg-ink px-3 py-2 text-xs text-paper group-hover:block">
              <b>{String(h.hour).padStart(2, "0")}:00</b> · {h.cups} cups · {formatMoney(h.totalCents)}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-[2px]">{hours.map(h => <span key={h.hour} className="flex-1 text-center text-[0.65rem] text-mute">{h.hour % 2 === first % 2 ? String(h.hour).padStart(2, "0") : ""}</span>)}</div>
    </figure>
  );
}

function BarList({ rows, compact = false }: { rows: { label: string; value: number; detail?: string }[]; compact?: boolean }) {
  const max = Math.max(...rows.map(r => r.value), 1);
  if (!rows.length || rows.every(r => !r.value)) return <p className="py-6 text-sm text-mute">nothing yet.</p>;
  return (
    <ul className={cx("grid", compact ? "mt-2 gap-1.5" : "mt-4 gap-2.5")}>
      {rows.map((row, i) => (
        <li key={row.label} className="group" title={`${row.label}: ${row.value} cups${row.detail ? ` · ${row.detail}` : ""}`}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className={cx("truncate", compact ? "text-xs" : "font-semibold")}>{row.label}</span>
            <span className="text-xs tabular">{row.value}{row.detail ? <span className="text-mute"> · {row.detail}</span> : null}</span>
          </div>
          <div className={cx("mt-1 bg-smoke", compact ? "h-1.5" : "h-2.5")}>
            <div className={cx("h-full rounded-r-[4px] transition-colors", i === 0 && !compact ? "bg-ink" : "bg-ink group-hover:bg-ink")} style={{ width: `${(row.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function CloseDay({ open, report, onClose, onClosed }: { open: boolean; report: DailyReport | null; onClose: () => void; onClosed: (r: DailyReport) => void }) {
  const toast = useToast();
  const [note, setNote] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!report) return null;
  const steps = [
    "bring every booth tablet online and open it until its sync pill says “synced”.",
    "collect or cancel anything still on the bar queue.",
    "download the csv and reconcile cups and totals against the organiser's POS.",
    "close the day. history is kept; tomorrow starts fresh at midnight sgt with new numbers.",
  ];
  return (
    <Modal open={open} onClose={onClose} title={`close ${formatDayLabel(report.day)}`} labelledBy="close-day">
      <form className="grid gap-5 p-6" onSubmit={async e => {
        e.preventDefault(); setBusy(true); setError("");
        try { onClosed(await post<DailyReport>(`/api/lead/close?day=${report.day}`, { note, acknowledgeWarnings: ack })); toast("day closed · numbers recorded"); }
        catch (cause) { setError(cause instanceof ApiError ? cause.message : "Couldn't close the day."); }
        finally { setBusy(false); }
      }}>
        <ol className="grid gap-2 text-sm">{steps.map((s, i) => <li key={i} className="flex gap-3"><span className="font-bold text-ink">0{i + 1}</span>{s}</li>)}</ol>
        <div className="grid grid-cols-3 gap-px bg-line text-center">
          {[["cups", report.cups], ["value", formatMoney(report.totalCents)], ["cancelled", report.cancelledOrders]].map(([k, v]) => <div key={k} className="bg-cream p-3"><div className="text-sm text-mute">{k}</div><div className="text-2xl font-bold tracking-[-0.05em]">{v}</div></div>)}
        </div>
        {!report.reconciliation.complete && (
          <label className="flex items-start gap-3 border border-ink bg-paper p-3 text-sm">
            <input type="checkbox" className="mt-1 h-5 w-5 accent-[#1d1b1b]" checked={ack} onChange={e => setAck(e.target.checked)} />
            <span>close anyway. I&apos;ve reviewed: {report.reconciliation.warnings.join(" ")}</span>
          </label>
        )}
        <label className="field"><span>note for the record (optional)</span><textarea className="input min-h-20" maxLength={500} value={note} onChange={e => setNote(e.target.value)} /></label>
        {error && <Notice tone="bad">{error}</Notice>}
        <button className="btn btn-solid btn-lg" disabled={busy || (!report.reconciliation.complete && !ack)}>{busy ? <Spinner /> : "close the day"}</button>
      </form>
    </Modal>
  );
}
