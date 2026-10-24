"use client";
import { useEffect, useState, type FormEvent } from "react";
import type { MenuChange, MenuItem, StaffBridge, Temperature } from "../../lib/client/contracts";
import { money } from "../../lib/client/format";
import { useStaffBridge } from "../../lib/client/staff-bridge";
import { Freshness, Shell, StaffGate } from "./ui";
import styles from "./styles.module.css";

function draftFrom(item: MenuItem) {
  return { name: item.name, price: `${Math.floor(item.priceCents / 100)}.${String(item.priceCents % 100).padStart(2, "0")}`, milk: item.allowedMilk.join(", "), temperatures: item.allowedTemperatures.join(", "), soldOut: item.soldOut, active: item.active };
}
function MenuCard({ item, bridge }: { item: MenuItem; bridge: StaffBridge }) {
  const [draft, setDraft] = useState(() => draftFrom(item));
  const [baseline, setBaseline] = useState(item);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const pending = bridge.sync.pendingEntityIds.includes(item.id);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const conflict = bridge.sync.conflicts.find(conflict => conflict.entityId === item.id);
  const changedElsewhere = baseline.revision !== item.revision && dirty;
  useEffect(() => {
    if (!dirty) { setDraft(draftFrom(item)); setBaseline(item); }
  }, [item, dirty, bridge.sync.pendingCount]);
  function update<K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) { setDraft(current => ({ ...current, [key]: value })); setDirty(true); setMessage(""); setError(""); }
  async function save(event: FormEvent) {
    event.preventDefault(); setError(""); setMessage("");
    if (!/^\d{1,4}(\.\d{1,2})?$/.test(draft.price.trim())) { setError("Enter a price with at most two decimal places."); return; }
    const [dollars, cents = ""] = draft.price.trim().split(".");
    const priceCents = Number(dollars) * 100 + Number(cents.padEnd(2, "0"));
    const allowedMilk = draft.milk.split(",").map(value => value.trim()).filter(Boolean);
    const allowedTemperatures = draft.temperatures.split(",").map(value => value.trim()).filter(Boolean);
    if (!draft.name.trim() || draft.name.trim().length > 80 || priceCents > 100000) { setError("Use a name up to 80 characters and a price no higher than $1,000."); return; }
    if ([allowedMilk, allowedTemperatures].some(values => !values.length || values.length > 12 || new Set(values.map(v => v.toLowerCase())).size !== values.length || values.some(value => value.length > 80))) { setError("Give each modifier 1–12 unique options, each no longer than 80 characters."); return; }
    if (allowedTemperatures.some(value => value !== "hot" && value !== "iced")) { setError("Use hot and/or iced as temperature options."); return; }
    const payload: MenuChange = { name: draft.name.trim(), priceCents, allowedMilk, allowedTemperatures: allowedTemperatures as Temperature[], soldOut: draft.soldOut, active: draft.active };
    setSaving(true);
    try {
      const receipt = await bridge.submitOperation({ kind: "updateMenu", entityId: item.id, expectedRevision: baseline.revision, payload });
      setDirty(false);
      setMessage(receipt.state === "pending" ? "Saved on this tablet · pending sync. Other devices still have the last synced menu." : "Menu change synced.");
      if (receipt.state === "acknowledged") await bridge.refreshMenu();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn't save. Your edits are still here."); }
    finally { setSaving(false); }
  }
  return <form className={styles.menuCard} onSubmit={save}><div className={styles.menuCardHeading}><div><h2>{item.name}</h2><span>{money(item.priceCents)} · revision {item.revision}</span></div><span className={`${styles.badge} ${!item.active || item.soldOut ? styles.badgeOff : ""}`}>{!item.active ? "INACTIVE" : item.soldOut ? "SOLD OUT" : "AVAILABLE"}</span></div>
    <div className={styles.fields}><label className={styles.field}>Item name<input className={styles.input} value={draft.name} onChange={e => update("name", e.target.value)} maxLength={80} required autoComplete="off"/></label><label className={styles.field}>Price · SGD<input className={styles.input} value={draft.price} onChange={e => update("price", e.target.value)} inputMode="decimal" required aria-label={`Price for ${item.name}`}/></label><label className={`${styles.field} ${styles.full}`}>Milk options · separated by commas<input className={styles.input} value={draft.milk} onChange={e => update("milk", e.target.value)} required/></label><label className={`${styles.field} ${styles.full}`}>Temperature options · separated by commas<input className={styles.input} value={draft.temperatures} onChange={e => update("temperatures", e.target.value)} required/></label></div>
    <div className={styles.checks}><label><input type="checkbox" checked={draft.soldOut} onChange={e => update("soldOut", e.target.checked)}/>Sold out today</label><label><input type="checkbox" checked={draft.active} onChange={e => update("active", e.target.checked)}/>Active on menu</label></div>
    {(changedElsewhere || conflict) && <div className={`${styles.notice} ${styles.error}`} role="alert"><p>{conflict?.message ?? "This item changed elsewhere. Review the current menu before saving."}</p><button type="button" className={`${styles.button} ${styles.secondary}`} onClick={() => { setDraft(draftFrom(item)); setBaseline(item); setDirty(false); setError(""); setMessage("Current values loaded. Resolve the conflict in the shared sync panel before submitting another change."); }}>Load current values</button></div>}
    {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
    {message && <p className={`${styles.notice} ${styles.success}`} role="status">{message}</p>}
    <div className={styles.buttonRow}><button type="submit" className={styles.button} disabled={saving || !dirty || pending || changedElsewhere || !!conflict}>{saving ? "Saving…" : pending ? "Pending sync" : "Save changes"}</button>{pending && <small>Retained by the shared tablet outbox</small>}</div>
  </form>;
}
function Editor({ bridge }: { bridge: StaffBridge }) {
  const [refreshError, setRefreshError] = useState("");
  return <><div className={styles.pageHeading}><div><span className={styles.eyebrow}>THE BOOTH, IN GOOD HANDS</span><h1>A menu that keeps up.</h1><p>Keep today's drinks, prices and availability in sync with the team.</p></div><span className={styles.badge}>{bridge.menu?.items.length ?? 0} MENU ITEMS</span></div>
    <Freshness offline={!bridge.sync.online} error={refreshError ? new Error(refreshError) : null} syncedAt={bridge.sync.lastSyncedAt} onRetry={() => { setRefreshError(""); void bridge.refreshMenu().catch(() => setRefreshError("Menu refresh failed.")); }}/>
    {bridge.sync.pendingCount > 0 && <div className={styles.notice} role="status">{bridge.sync.pendingCount} changes pending on this tablet. They reach other devices after syncing.</div>}
    {!bridge.sync.online && <div className={styles.notice}>Offline menu changes stay on this tablet until synced. Another disconnected tablet may still sell an item marked sold out here. Reconcile with the team.</div>}
    <p className={styles.finePrint}>Price changes apply to new orders. Existing orders keep their original prices. Deactivate an item to remove it from order entry.</p>
    {bridge.menu ? <div className={styles.menuGrid} style={{ marginTop: 26 }}>{bridge.menu.items.map(item => <MenuCard item={item} bridge={bridge} key={item.id}/>)}</div> : <div className={styles.empty} role="status"><h2>Menu not loaded yet</h2><p>Connect once to load the shared menu. First-time offline use isn't available.</p></div>}
  </>;
}
export function MenuScreen() {
  const bridge = useStaffBridge();
  return <Shell section="menu">{!bridge || bridge.loading || bridge.role !== "booth_lead" ? <StaffGate configured={!!bridge} loading={bridge?.loading} role={bridge?.role}/> : <Editor bridge={bridge}/>}</Shell>;
}
