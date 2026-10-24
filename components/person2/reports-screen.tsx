"use client";
import { useMemo, useState } from "react";
import { createHttpAdapters, type LeadAdapter } from "../../lib/client/adapters";
import { money, sgtDay, sgtTime } from "../../lib/client/format";
import { useStaffBridge } from "../../lib/client/staff-bridge";
import { usePoll } from "../../lib/client/use-poll";
import { Freshness, Shell, StaffGate } from "./ui";
import styles from "./styles.module.css";

function Report({ adapter, initialDay }: { adapter: LeadAdapter; initialDay?: string }) {
  const bridge = useStaffBridge()!;
  const [day, setDay] = useState(initialDay ?? sgtDay());
  const poll = usePoll(signal => adapter.report(day, signal), { interval: 15000, requestKey: day });
  const report = poll.data?.day === day ? poll.data : null;
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  async function download() {
    setExporting(true); setExportMessage("");
    try {
      const download = await adapter.csv(day);
      const url = URL.createObjectURL(download.blob); const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `beans-and-beats-${day}${download.reconciliationComplete ? "" : "-provisional"}.csv`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportMessage(`${download.reconciliationComplete ? "CSV" : "Provisional CSV"} downloaded from the server's current snapshot. It may include changes since this screen last refreshed. Review cancellations and reconcile all tablets with the POS before closing.`);
      poll.retry();
    } catch { setExportMessage("Couldn't export. Reconnect and try again; no replacement or empty CSV has been generated."); }
    finally { setExporting(false); }
  }
  return <><div className={styles.pageHeading}><div><span className={styles.eyebrow}>EVERY CUP COUNTS</span><h1>A day of doing good.</h1><p>Recorded cups and order values, ready for your daily POS reconciliation.</p></div></div>
    <div className={styles.toolbar}><label>Event day · SGT<input type="date" className={`${styles.input} ${styles.date}`} value={day} onChange={event => { if (event.target.value) { setDay(event.target.value); setExportMessage(""); } }}/></label><button className={styles.button} onClick={() => void download()} disabled={exporting || poll.offline || !!poll.error || !report || poll.loading}>{exporting ? "Preparing CSV…" : "↓ Export daily CSV"}</button></div>
    <Freshness offline={poll.offline} error={poll.error} loading={poll.loading} syncedAt={report?.generatedAt} onRetry={poll.retry}/>
    {exportMessage && <p className={styles.notice} role="status">{exportMessage}</p>}
    {(bridge.sync.pendingCount > 0 || !bridge.sync.online) && <div className={styles.notice} role="alert">This tablet has {bridge.sync.pendingCount} pending operations{!bridge.sync.online ? " and is offline" : ""}. Server totals exclude unsynced changes. Reconcile before closing.</div>}
    {report && <>{!report.reconciliationDetails.complete && <div className={styles.notice} role="alert"><strong>Provisional totals · reconciliation needed</strong>{report.reconciliationDetails.warnings.map(warning => <p key={warning}>{warning}</p>)}</div>}
      <div className={styles.stats}><div className={styles.stat}><span>Recorded cups</span><strong>{report.cups}</strong><small>{report.orderCount} non-cancelled orders</small></div><div className={styles.stat}><span>Recorded order value</span><strong>{money(report.totalCents)}</strong><small>Not verified POS payments</small></div><div className={styles.stat}><span>Cancelled cups</span><strong>{report.cancelledCups}</strong><small>{money(report.cancelledTotalCents)} excluded · {report.cancelledOrders} orders</small></div></div>
      <p className={styles.finePrint}>{report.definition} Event day is assigned in Asia/Singapore when the order is created; delayed syncing doesn't move a sale into another day.</p>
      <div className={styles.sectionHeading}><h2>The day's drinks</h2><span>Server snapshot · {sgtTime(report.generatedAt)} SGT</span></div>
      {report.rows.length ? <div className={styles.tableWrap}><table className={styles.table}><caption className={styles.mobileOnly}>Drink lines for {day}, including cancellations</caption><thead><tr><th>Order / status</th><th>Drink / modifiers</th><th className={styles.numeric}>Cups</th><th className={styles.numeric}>Unit price</th><th className={styles.numeric}>Line total</th></tr></thead><tbody>{report.rows.map((line, index) => <tr key={`${line.publicNumber}:${index}`} className={line.status === "cancelled" ? styles.cancelled : undefined}><td>{line.publicNumber}<small>{line.status}{line.status === "cancelled" ? " · excluded" : ""}</small></td><td>{line.item}<small>{line.milk} · {line.temperature}</small></td><td className={styles.numeric}>{line.quantity}</td><td className={styles.numeric}>{money(line.unitPriceCents)}</td><td className={styles.numeric}>{money(line.lineTotalCents)}</td></tr>)}</tbody></table></div> : <div className={styles.empty}><h2>No recorded orders for this day.</h2><p>Choose another SGT date or refresh after the booth tablets sync.</p></div>}
      <p className={styles.finePrint}>CSV contains order numbers, drink snapshots, quantities, integer-cent prices and status. Exports awaiting reconciliation are marked provisional. No guest names or tracking tokens. Confirm the columns with the organiser's POS format.</p>
    </>}
    {!report && <div className={styles.empty} role="status"><h2>{poll.loading ? "Adding up the day's cups…" : "Report unavailable"}</h2><p>{poll.loading ? "Reading the server's synced orders." : "A first report needs a connection and a valid booth-lead session. Reconnect or sign in and retry."}</p></div>}
  </>;
}
export function ReportsScreen({ adapter, initialDay }: { adapter?: LeadAdapter; initialDay?: string }) {
  const bridge = useStaffBridge();
  const authenticated = useMemo(() => createHttpAdapters(fetch, bridge?.getAccessToken), [bridge?.getAccessToken]);
  return <Shell section="reports">{!bridge || bridge.loading || bridge.role !== "booth_lead" ? <StaffGate configured={!!bridge} loading={bridge?.loading} role={bridge?.role}/> : <Report adapter={adapter ?? authenticated} initialDay={initialDay}/>}</Shell>;
}
