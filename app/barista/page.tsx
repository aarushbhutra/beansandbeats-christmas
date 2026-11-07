"use client";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import { ChevronDown, Ellipsis, ScanLine } from "lucide-react";
import { useMemo, useState } from "react";
import { PickupScanner } from "@/components/staff/pickup-scanner";
import { StaffShell } from "@/components/staff/shell";
import { cx, Modal, Spinner, useToast } from "@/components/ui/ui";
import { requestSync } from "@/lib/client/engine";
import { useNow, useOrders, useOutbox, useTicket } from "@/lib/client/hooks";
import { changeLocalStatus, LocalWriteError } from "@/lib/client/outbox";
import { cupCount, formatSgtTime, milkLabel, nextStatus } from "@/lib/domain/rules";
import type { LocalOrder } from "@/lib/client/db";

const COLUMNS = [
  { status: "queued", title: "received", action: "start making" },
  { status: "making", title: "making", action: "ready" },
  { status: "ready", title: "ready to collect", action: "collected" },
] as const;

export default function BaristaPage() {
  return <StaffShell area="barista" needsDevice><Queue /></StaffShell>;
}

function Queue() {
  const orders = useOrders();
  const outbox = useOutbox();
  const now = useNow(1000);
  const [showDone, setShowDone] = useState(false);
  const [qrFor, setQrFor] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<LocalOrder | null>(null);
  const [scanning, setScanning] = useState(false);
  const byStatus = useMemo(() => {
    const list = (orders ?? []).filter(o => !o.rejected);
    const sort = (a: LocalOrder, b: LocalOrder) => (a.receivedAtServer ?? a.createdAtDevice).localeCompare(b.receivedAtServer ?? b.createdAtDevice);
    return {
      queued: list.filter(o => o.status === "queued").sort(sort),
      making: list.filter(o => o.status === "making").sort(sort),
      ready: list.filter(o => o.status === "ready").sort((a, b) => (a.readyAt ?? "").localeCompare(b.readyAt ?? "")),
      done: list.filter(o => o.status === "collected" || o.status === "cancelled").sort((a, b) => (b.collectedAt ?? b.cancelledAt ?? "").localeCompare(a.collectedAt ?? a.cancelledAt ?? "")),
    };
  }, [orders]);
  const cups = cupCount([...byStatus.queued, ...byStatus.making].flatMap(o => o.items));

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="h-display text-[2.6rem]">queue</h1>
          <p className="mt-1 text-mute">{cups} {cups === 1 ? "cup" : "cups"} to make · {byStatus.done.filter(o => o.status === "collected").length} collected today</p>
        </div>
        <button className="btn btn-solid btn-lg" onClick={() => setScanning(true)}><ScanLine className="h-5 w-5" /> scan pickup</button>
      </div>

      {orders === undefined ? (
        <div className="mt-6 grid gap-4 md:grid-cols-3">{[0, 1, 2].map(i => <div key={i} className="skeleton h-96" />)}</div>
      ) : (
        <LayoutGroup>
          <div className="mt-6 grid items-start gap-4 md:grid-cols-3">
            {COLUMNS.map(column => {
              const list = byStatus[column.status];
              return (
                <section key={column.status} aria-labelledby={`col-${column.status}`} className="min-h-[60svh] border border-line">
                  <header className="bar flex items-center justify-between !px-4 !py-2.5 !text-left !text-lg">
                    <h2 id={`col-${column.status}`}>{column.title}</h2>
                    <span className="tabular">{list.length}</span>
                  </header>
                  <div className="grid gap-3 p-3">
                    <AnimatePresence mode="popLayout" initial={false}>
                      {list.map(order => (
                        <OrderCard key={order.id} order={order} now={now} pending={outbox.entities.has(order.id)} action={column.action} onQr={() => setQrFor(order.id)} onCancel={() => setCancelling(order)} />
                      ))}
                    </AnimatePresence>
                    {!list.length && <p className="py-10 text-center text-sm text-mute">{column.status === "queued" ? "No new orders." : column.status === "making" ? "Nothing being made." : "Nothing waiting for pickup."}</p>}
                  </div>
                </section>
              );
            })}
          </div>
        </LayoutGroup>
      )}

      <section className="mt-6">
        <button className="btn btn-text !px-0" onClick={() => setShowDone(!showDone)} aria-expanded={showDone}>
          <ChevronDown className={cx("h-4 w-4 transition-transform", showDone && "rotate-180")} /> collected and cancelled today ({byStatus.done.length})
        </button>
        {showDone && (
          <ul className="mt-2 grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
            {byStatus.done.map(order => (
              <li key={order.id} className="flex items-center gap-3 bg-paper px-3 py-2 text-sm">
                <span className={cx("font-bold", order.status === "cancelled" && "text-mute line-through")}>{order.shortNumber}</span>
                <span className="truncate text-mute">{order.firstName ?? "name removed"}</span>
                <span className="ml-auto text-mute">{order.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <QrModal orderId={qrFor} onClose={() => setQrFor(null)} />
      <CancelModal order={cancelling} onClose={() => setCancelling(null)} />
      <PickupScanner open={scanning} onClose={() => setScanning(false)} />
    </div>
  );
}

function OrderCard({ order, now, pending, action, onQr, onCancel }: { order: LocalOrder; now: number; pending: boolean; action: string; onQr: () => void; onCancel: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const since = order.status === "ready" ? order.readyAt ?? order.createdAtDevice : order.createdAtDevice;
  const seconds = Math.max(0, Math.floor((now - Date.parse(since)) / 1000));
  const late = order.status !== "ready" && seconds >= 480;
  const target = nextStatus(order.status);

  async function advance() {
    if (!target || busy) return;
    setBusy(true);
    try { await changeLocalStatus(order.id, target); requestSync(); }
    catch (error) { toast(error instanceof LocalWriteError ? error.message : "Couldn't save that change.", "bad"); }
    finally { setBusy(false); }
  }

  return (
    <motion.article layout layoutId={order.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.12 } }} transition={{ duration: 0.2 }}
      className={cx("border bg-paper", late ? "border-ink border-2" : "border-ink")}>
      <div className="flex items-start justify-between gap-3 px-4 pt-3">
        <div className="min-w-0">
          <div className="text-[2rem] font-bold leading-none tracking-[-0.05em]">{order.shortNumber}</div>
          <div className="mt-1 truncate text-lg">{order.firstName ?? "—"}</div>
        </div>
        <div className="text-right text-sm">
          <div className={cx("tabular", late ? "font-bold" : "text-mute")}>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</div>
          <div className="text-xs text-mute">{order.status === "ready" ? "waiting" : formatSgtTime(order.createdAtDevice)}</div>
        </div>
      </div>
      <ul className="grid gap-1 px-4 py-3">
        {order.items.map((item, i) => (
          <li key={i} className="flex items-baseline gap-2">
            <span className="font-bold tabular">{item.quantity}×</span>
            <span className="min-w-0 flex-1 font-bold tracking-[-0.03em]">{item.nameSnapshot}</span>
            <span className="text-sm">{[item.milk !== "none" && item.milk !== "milk" ? milkLabel(item.milk) : null, item.temperature === "iced" ? "iced" : "hot"].filter(Boolean).join(" · ")}</span>
          </li>
        ))}
      </ul>
      {(pending || order.localOnly || order.flags.length > 0) && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-3 text-xs text-mute">
          {(pending || order.localOnly) && <span className="inline-flex items-center gap-1"><span className="dot pulse" /> saved on this tablet, syncing</span>}
          {order.flags.map(flag => <span key={flag} className="tag">{flag.replace(/_/g, " ")}</span>)}
        </div>
      )}
      <div className="flex border-t border-ink">
        <button className="btn btn-solid flex-1 !border-0" disabled={busy || !target} onClick={advance}>{busy ? <Spinner /> : action}</button>
        <div className="relative">
          <button className="btn btn-outline h-full !border-0 !border-l !border-ink !px-3" aria-label={`More actions for ${order.shortNumber}`} aria-expanded={menu} onClick={() => setMenu(!menu)}><Ellipsis className="h-5 w-5" /></button>
          {menu && (
            <div className="absolute bottom-full right-0 z-20 mb-1 grid w-44 border border-ink bg-paper text-sm" onMouseLeave={() => setMenu(false)}>
              <button className="px-4 py-3 text-left font-bold hover:bg-wash" onClick={() => { setMenu(false); onQr(); }}>show tracking QR</button>
              <button className="border-t border-line px-4 py-3 text-left font-bold text-bad hover:bg-wash" onClick={() => { setMenu(false); onCancel(); }}>cancel order</button>
            </div>
          )}
        </div>
      </div>
    </motion.article>
  );
}

function QrModal({ orderId, onClose }: { orderId: string | null; onClose: () => void }) {
  const ticket = useTicket(orderId);
  return (
    <Modal open={Boolean(orderId)} onClose={onClose} title={ticket ? `order ${ticket.publicNumber.split("-").slice(1).join("-")}` : "tracking QR"} labelledBy="qr-title">
      <div className="grid place-items-center gap-3 p-8">
        {ticket === undefined ? <Spinner /> : ticket ? (
          <>
            <QRCodeSVG value={`${window.location.origin}/guest#${ticket.token}`} size={240} level="M" marginSize={2} />
            <p className="text-center text-sm text-mute">Scan to follow this order. The link is private to the guest.</p>
          </>
        ) : <p className="text-center text-sm text-mute">This order was taken on another tablet, so its private link is on that tablet.</p>}
      </div>
    </Modal>
  );
}

function CancelModal({ order, onClose }: { order: LocalOrder | null; onClose: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const presets = ["guest changed their mind", "entered by mistake", "ran out", "duplicate"];
  return (
    <Modal open={Boolean(order)} onClose={onClose} title={order ? `cancel ${order.shortNumber}?` : ""} labelledBy="cancel-title">
      <form className="grid gap-4 p-5" onSubmit={async e => {
        e.preventDefault();
        if (!order) return;
        setBusy(true);
        try { await changeLocalStatus(order.id, "cancelled", reason); requestSync(); toast(`${order.shortNumber} cancelled`); setReason(""); onClose(); }
        catch (error) { toast(error instanceof LocalWriteError ? error.message : "Couldn't cancel.", "bad"); }
        finally { setBusy(false); }
      }}>
        <p className="text-sm text-mute">Cancelled orders stay in the daily report but don&apos;t count towards totals. Refunds happen on the organiser&apos;s POS.</p>
        <div className="flex flex-wrap gap-2">{presets.map(p => <button type="button" key={p} className="opt" aria-pressed={reason === p} onClick={() => setReason(p)}>{p}</button>)}</div>
        <label className="field"><span>reason</span><input className="input" value={reason} onChange={e => setReason(e.target.value)} maxLength={200} required /></label>
        <button className="btn btn-solid" disabled={busy || !reason.trim()}>{busy ? <Spinner /> : "cancel order"}</button>
      </form>
    </Modal>
  );
}
