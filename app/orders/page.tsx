"use client";
import { AnimatePresence, motion } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import { Check, ShoppingBag, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { StaffShell } from "@/components/staff/shell";
import { cx, Empty, Modal, Spinner, Stepper, useToast } from "@/components/ui/ui";
import { requestSync } from "@/lib/client/engine";
import { useDevice, useEngine, useMenu, useMenuSyncedAt, useNow, useOrders, useTicket } from "@/lib/client/hooks";
import { createLocalOrder, LocalWriteError } from "@/lib/client/outbox";
import { cupCount, formatMoney, formatSgtTime, milkLabel, orderTotal, surchargeSummary, unitPriceCents } from "@/lib/domain/rules";
import type { MenuItem, OrderItem, Temperature } from "@/lib/domain/types";
import type { LocalOrder } from "@/lib/client/db";

type Line = OrderItem & { key: string };

export default function OrdersPage() {
  return <StaffShell area="orders" needsDevice fullBleed><OrderEntry /></StaffShell>;
}

function OrderEntry() {
  const menu = useMenu();
  const device = useDevice();
  const toast = useToast();
  const [picking, setPicking] = useState<MenuItem | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [ticketFor, setTicketFor] = useState<string | null>(null);
  const [mobileTicket, setMobileTicket] = useState(false);
  const visible = useMemo(() => (menu ?? []).filter(item => item.active), [menu]);
  const total = lines.length ? orderTotal(lines) : 0;

  function addLine(line: OrderItem) {
    setLines(current => {
      const same = current.find(l => l.menuItemId === line.menuItemId && l.milk === line.milk && l.temperature === line.temperature && l.menuRevision === line.menuRevision);
      if (same) return current.map(l => (l === same ? { ...l, quantity: Math.min(20, l.quantity + line.quantity) } : l));
      return [...current, { ...line, key: crypto.randomUUID() }];
    });
  }

  async function submit() {
    if (saving) return;
    setSaving(true);
    try {
      const { order } = await createLocalOrder({ firstName: name, items: lines.map(({ key: _key, ...line }) => line) });
      setLines([]); setName(""); setMobileTicket(false);
      setTicketFor(order.id);
      requestSync();
    } catch (error) {
      toast(error instanceof LocalWriteError ? error.message : "Couldn't save the order on this tablet. Nothing was sent.", "bad");
    } finally {
      setSaving(false);
    }
  }

  const ticket = (
    <TicketPanel name={name} setName={setName} lines={lines} setLines={setLines} total={total} saving={saving} canSave={Boolean(device) && lines.length > 0 && name.trim().length > 0} onSubmit={submit} onShowTicket={setTicketFor} />
  );

  return (
    <div className="mx-auto grid max-w-[1400px] lg:grid-cols-[minmax(0,1fr)_400px]">
      <section className="min-w-0 pb-28 lg:pb-10">
        <div className="bar">menu</div>
        <MenuFreshness />
        {menu === undefined ? (
          <div className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton h-40" />)}</div>
        ) : !visible.length ? (
          <Empty title="no menu on this tablet yet">Sign in while online once. The menu is then saved on this tablet for offline use.</Empty>
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3">
            {visible.map(item => <DrinkTile key={item.id} item={item} inTicket={lines.filter(l => l.menuItemId === item.id).reduce((s, l) => s + l.quantity, 0)} onPick={() => setPicking(item)} />)}
          </div>
        )}
      </section>

      <aside className="hidden border-l border-line lg:block">
        <div className="sticky top-16 h-[calc(100svh-4rem)] overflow-y-auto scroll-thin">{ticket}</div>
      </aside>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper p-3 lg:hidden">
        <button className="btn btn-solid btn-lg w-full justify-between" onClick={() => setMobileTicket(true)}>
          <span className="inline-flex items-center gap-2"><ShoppingBag className="h-5 w-5" /> order · {cupCount(lines)} {cupCount(lines) === 1 ? "drink" : "drinks"}</span>
          <span>{formatMoney(total)}</span>
        </button>
      </div>
      <Modal open={mobileTicket} onClose={() => setMobileTicket(false)} title="this order" labelledBy="mobile-ticket">{ticket}</Modal>

      <DrinkSheet item={picking} onClose={() => setPicking(null)} onAdd={line => { addLine(line); setPicking(null); }} />
      <TicketModal orderId={ticketFor} onClose={() => setTicketFor(null)} />
    </div>
  );
}

function MenuFreshness() {
  const engine = useEngine();
  const syncedAt = useMenuSyncedAt();
  const now = useNow(15_000);
  const minutes = syncedAt ? Math.round((now - Date.parse(syncedAt)) / 60000) : null;
  if (engine.online && minutes !== null && minutes <= 10) return null;
  return (
    <div className="border-b border-ink bg-paper px-4 py-2.5 text-sm" role="status">
      {!engine.online
        ? <><b>Offline.</b> Using the menu saved {minutes === null ? "earlier" : `${minutes} min ago`}. Items sold out since then may still show.</>
        : minutes === null ? "Loading the menu…" : <>Menu last updated {minutes} min ago.</>}
    </div>
  );
}

function DrinkTile({ item, inTicket, onPick }: { item: MenuItem; inTicket: number; onPick: () => void }) {
  return (
    <button onClick={onPick} disabled={item.soldOut}
      className={cx("relative flex min-h-40 flex-col border-b border-line bg-paper p-5 text-left transition-colors sm:border-r", item.soldOut ? "cursor-not-allowed text-dim" : "hover:bg-wash active:bg-wash", inTicket > 0 && "outline outline-2 -outline-offset-2 outline-ink")}
      aria-label={`${item.name}, ${formatMoney(item.priceCents)}${item.soldOut ? ", sold out" : ""}`}>
      <h3 className="h-title text-[1.6rem]">{item.name}</h3>
      <p className="mt-1">{formatMoney(item.priceCents)}</p>
      {surchargeSummary(item) && <p className="mt-0.5 text-sm text-mute">{surchargeSummary(item)}</p>}
      <div className="mt-auto flex items-end justify-between pt-4 text-sm text-mute">
        <span>{[item.allowedTemperatures.join(" / "), item.allowedMilk.length > 1 ? item.allowedMilk.join(" / ") : milkLabel(item.allowedMilk[0])].join(" · ")}</span>
        {item.soldOut ? <span className="tag text-ink">sold out</span> : inTicket > 0 ? <span className="tag tag-solid">{inTicket} added</span> : null}
      </div>
    </button>
  );
}

function DrinkSheet({ item, onClose, onAdd }: { item: MenuItem | null; onClose: () => void; onAdd: (line: OrderItem) => void }) {
  return (
    <Modal open={Boolean(item)} onClose={onClose} title={item?.name} labelledBy="drink-title">
      {item && <DrinkOptions key={item.id + item.revision} item={item} onAdd={onAdd} />}
    </Modal>
  );
}

function DrinkOptions({ item, onAdd }: { item: MenuItem; onAdd: (line: OrderItem) => void }) {
  const [milk, setMilk] = useState(item.allowedMilk[0]);
  const [temperature, setTemperature] = useState<Temperature>(item.allowedTemperatures[0]);
  const [quantity, setQuantity] = useState(1);
  const unit = unitPriceCents(item, milk, temperature);
  const plus = (cents: number | undefined) => (cents ? <span className="font-normal opacity-70">+{formatMoney(cents)}</span> : null);
  return (
    <div className="grid gap-5 p-5">
      {item.allowedMilk.length > 1 && (
        <fieldset>
          <legend className="label mb-2">milk</legend>
          <div className="flex flex-wrap gap-2">{item.allowedMilk.map(option => <button key={option} type="button" className="opt" aria-pressed={milk === option} onClick={() => setMilk(option)}>{milkLabel(option)} {plus(item.milkSurcharges[option])}</button>)}</div>
        </fieldset>
      )}
      {item.allowedTemperatures.length > 1 && (
        <fieldset>
          <legend className="label mb-2">hot or iced</legend>
          <div className="grid grid-cols-2 gap-2">
            {item.allowedTemperatures.map(option => (
              <button key={option} type="button" className="opt" aria-pressed={temperature === option} onClick={() => setTemperature(option)}>{option} {option === "iced" && plus(item.icedSurchargeCents)}</button>
            ))}
          </div>
        </fieldset>
      )}
      <div className="flex items-center justify-between gap-4">
        <span className="label">cups</span>
        <Stepper value={quantity} onChange={setQuantity} label="cups" />
      </div>
      <button className="btn btn-solid btn-lg w-full justify-between" autoFocus
        onClick={() => onAdd({ menuItemId: item.id, menuRevision: item.revision, nameSnapshot: item.name, unitPriceCentsSnapshot: unit, quantity, milk, temperature })}>
        <span>add</span><span>{formatMoney(unit * quantity)}</span>
      </button>
    </div>
  );
}

function TicketPanel({ name, setName, lines, setLines, total, saving, canSave, onSubmit, onShowTicket }: {
  name: string; setName: (v: string) => void; lines: Line[]; setLines: (fn: (l: Line[]) => Line[]) => void; total: number; saving: boolean; canSave: boolean; onSubmit: () => void; onShowTicket: (id: string) => void;
}) {
  const device = useDevice();
  const orders = useOrders();
  const recent = useMemo(() => (orders ?? []).filter(o => o.deviceId === device?.id).sort((a, b) => b.createdAtDevice.localeCompare(a.createdAtDevice)).slice(0, 5), [orders, device]);
  return (
    <div className="flex min-h-full flex-col">
      <div className="bar hidden lg:block">new order</div>
      <div className="flex flex-1 flex-col p-5">
        <label className="field">
          <span>first name</span>
          <input className="input text-xl font-bold" value={name} maxLength={40} autoComplete="off" autoCapitalize="words" spellCheck={false} onChange={e => setName(e.target.value)} enterKeyHint="done" />
        </label>
        <p className="mt-1.5 text-xs text-mute">First name only. It shows on the ready board until pickup, then it&apos;s deleted.</p>

        <ul className="mt-5 border-t border-ink" aria-label="Drinks in this order">
          <AnimatePresence initial={false}>
            {lines.map(line => (
              <motion.li key={line.key} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden border-b border-line">
                <div className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold tracking-[-0.03em]">{line.nameSnapshot}</div>
                    <div className="text-sm text-mute">{milkLabel(line.milk)} · {line.temperature} · {formatMoney(line.unitPriceCentsSnapshot)}</div>
                  </div>
                  <Stepper value={line.quantity} label={`${line.nameSnapshot} cups`} onChange={quantity => setLines(current => current.map(l => (l.key === line.key ? { ...l, quantity } : l)))} />
                  <button className="grid h-11 w-8 place-items-center text-mute hover:text-ink" aria-label={`Remove ${line.nameSnapshot}`} onClick={() => setLines(current => current.filter(l => l.key !== line.key))}><Trash2 className="h-4 w-4" /></button>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
          {!lines.length && <li className="py-8 text-center text-sm text-mute">Tap a drink to add it.</li>}
        </ul>

        <div className="mt-5 flex items-baseline justify-between">
          <span className="label">total · {cupCount(lines)} {cupCount(lines) === 1 ? "cup" : "cups"}</span>
          <span className="text-4xl font-bold tracking-[-0.05em] tabular">{formatMoney(total)}</span>
        </div>
        <button className="btn btn-solid btn-lg mt-4 w-full" disabled={!canSave || saving} onClick={onSubmit}>
          {saving ? <Spinner /> : "send to bar"}
        </button>
        <p className="mt-2 text-center text-xs text-mute">Take payment on the organiser&apos;s POS (PayNow or card).</p>

        {recent.length > 0 && (
          <div className="mt-auto pt-8">
            <p className="label mb-2">recent</p>
            <ul className="divide-y divide-line border-y border-line">
              {recent.map(order => (
                <li key={order.id}>
                  <button onClick={() => onShowTicket(order.id)} className="flex w-full items-center gap-3 py-2.5 text-left text-sm hover:bg-wash">
                    <span className="w-14 font-bold">{order.shortNumber}</span>
                    <span className="flex-1 truncate">{order.firstName ?? "—"}</span>
                    <OrderState order={order} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function OrderState({ order }: { order: LocalOrder }) {
  if (order.rejected) return <span className="tag text-bad">rejected</span>;
  if (order.localOnly) return <span className="text-mute">saved · syncing</span>;
  return <span className="text-mute">{order.status === "making" ? "making" : order.status}</span>;
}

function TicketModal({ orderId, onClose }: { orderId: string | null; onClose: () => void }) {
  const ticket = useTicket(orderId);
  const orders = useOrders();
  const order = orders?.find(o => o.id === orderId);
  const engine = useEngine();
  const url = ticket && typeof window !== "undefined" ? `${window.location.origin}/guest#${ticket.token}` : "";
  return (
    <Modal open={Boolean(orderId)} onClose={onClose} wide labelledBy="ticket-number">
      {order && (
        <div className="grid sm:grid-cols-[1fr_auto]">
          <div className="p-6 sm:p-8">
            <p className="text-sm text-mute">beans&amp;beats café</p>
            <h2 id="ticket-number" className="mt-1 text-[3.5rem] font-bold leading-none tracking-[-0.06em]">order {order.shortNumber}</h2>
            <p className="mt-3 text-lg">{order.firstName}, {order.items.map(item => `${item.quantity > 1 ? `${item.quantity}× ` : ""}${item.milk === "oat" ? "oat " : ""}${item.temperature === "iced" ? "iced " : ""}${item.nameSnapshot}`).join(", ")}</p>
            <div className="mt-6 flex items-baseline justify-between border-y border-ink py-3">
              <span className="label">key into pos</span>
              <span className="text-[2.5rem] font-bold leading-none tracking-[-0.05em] tabular">{formatMoney(order.totalCents)}</span>
            </div>
            <p className="mt-4 flex items-center gap-2 text-sm" role="status">
              {order.rejected ? <span className="text-bad">The server rejected this order: {order.rejected.message}</span>
                : order.localOnly ? <><span className="dot pulse" /> Saved on this tablet{engine.online ? ", syncing…" : ". It syncs when the Wi-Fi is back."}</>
                : <><Check className="h-4 w-4" /> Sent to the bar. Live tracking is on.</>}
            </p>
            <button className="btn btn-solid btn-lg mt-6" onClick={onClose} autoFocus>next order</button>
            <p className="mt-4 text-xs text-mute">{order.publicNumber} · {formatSgtTime(order.createdAtDevice)}</p>
          </div>
          <div className="flex flex-col items-center justify-center gap-3 border-t border-line bg-wash p-6 sm:w-80 sm:border-l sm:border-t-0">
            {url ? <QRCodeSVG value={url} size={220} level="M" marginSize={2} bgColor="#ffffff" title={`Track order ${order.shortNumber}`} /> : <div className="skeleton h-[220px] w-[220px]" />}
            <p className="h-title text-center text-xl">scan to follow your order</p>
            <p className="text-center text-xs text-mute">{order.localOnly ? "The link starts working as soon as this tablet syncs." : "Live updates and a buzz when it's ready."}</p>
          </div>
        </div>
      )}
    </Modal>
  );
}
