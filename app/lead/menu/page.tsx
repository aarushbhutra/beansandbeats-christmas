"use client";
import { Flame, Plus, Snowflake, X } from "lucide-react";
import { useState } from "react";
import { cx, Modal, Notice, Spinner, Switch, useToast } from "@/components/ui/ui";
import { ApiError, patch, post } from "@/lib/client/api";
import { requestSync } from "@/lib/client/engine";
import { useApi } from "@/lib/client/use-api";
import { centsToInput, formatMoney, parsePriceToCents, surchargeSummary } from "@/lib/domain/rules";
import type { MenuCategory, MenuItem, Temperature } from "@/lib/domain/types";

type Draft = { name: string; description: string; category: MenuCategory; price: string; allowedMilk: string[]; allowedTemperatures: Temperature[]; iced: string; milkPrices: Record<string, string>; soldOut: boolean; active: boolean; sortOrder: number };
const toDraft = (item: MenuItem): Draft => ({
  name: item.name, description: item.description, category: item.category, price: centsToInput(item.priceCents), allowedMilk: item.allowedMilk, allowedTemperatures: item.allowedTemperatures,
  iced: item.icedSurchargeCents ? centsToInput(item.icedSurchargeCents) : "", milkPrices: Object.fromEntries(Object.entries(item.milkSurcharges).map(([k, v]) => [k, centsToInput(v)])),
  soldOut: item.soldOut, active: item.active, sortOrder: item.sortOrder,
});
const blank: Draft = { name: "", description: "", category: "coffee", price: "", allowedMilk: ["milk", "oat"], allowedTemperatures: ["hot", "iced"], iced: "1.00", milkPrices: { oat: "1.00" }, soldOut: false, active: true, sortOrder: 100 };

function toChange(draft: Draft) {
  const priceCents = parsePriceToCents(draft.price);
  if (priceCents === null) throw new Error("Enter a price like 6.50.");
  if (!draft.name.trim()) throw new Error("Give the drink a name.");
  if (!draft.allowedMilk.length) throw new Error("Add at least one milk option (use “none” for black drinks).");
  if (!draft.allowedTemperatures.length) throw new Error("Pick hot, iced or both.");
  const extra = (value: string | undefined, label: string) => {
    if (!value?.trim()) return 0;
    const cents = parsePriceToCents(value);
    if (cents === null) throw new Error(`Enter the ${label} surcharge like 1.00.`);
    return cents;
  };
  const milkSurcharges = Object.fromEntries(draft.allowedMilk.map(m => [m, extra(draft.milkPrices[m], m)]).filter(([, v]) => (v as number) > 0));
  return {
    name: draft.name.trim(), description: draft.description.trim(), category: draft.category, priceCents, allowedMilk: draft.allowedMilk, allowedTemperatures: draft.allowedTemperatures,
    icedSurchargeCents: draft.allowedTemperatures.includes("iced") ? extra(draft.iced, "iced") : 0, milkSurcharges, soldOut: draft.soldOut, active: draft.active, sortOrder: draft.sortOrder,
  };
}

export default function MenuPage() {
  const { data, error, reload, setData } = useApi<{ items: MenuItem[] }>("/api/lead/menu");
  const [adding, setAdding] = useState(false);
  const replace = (item: MenuItem) => setData(current => current ? { items: current.items.map(i => (i.id === item.id ? item : i)) } : current);
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-mute">booth lead · menu</p>
          <h1 className="h-display mt-1 text-[2.6rem]">menu</h1>
          <p className="mt-3 max-w-xl text-mute">changes reach every online tablet within seconds. offline tablets keep selling from their last copy; those sales are accepted at the price shown and flagged for review.</p>
        </div>
        <button className="btn btn-solid" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> add a drink</button>
      </div>
      {error && <Notice tone="note">{error.status === 0 ? "Menu editing needs a connection." : error.message}</Notice>}
      <div className="grid gap-4 xl:grid-cols-2">
        {(data?.items ?? []).map(item => <MenuRow key={item.id} item={item} onSaved={replace} onConflict={reload} />)}
        {!data && !error && Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-72" />)}
      </div>
      <Modal open={adding} onClose={() => setAdding(false)} title="new drink" labelledBy="new-drink" wide>
        <NewItem onCreated={item => { setData(current => current ? { items: [...current.items, item] } : current); setAdding(false); requestSync(); }} />
      </Modal>
    </div>
  );
}

function MenuRow({ item, onSaved, onConflict }: { item: MenuItem; onSaved: (item: MenuItem) => void; onConflict: () => void }) {
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(() => toDraft(item));
  const [base, setBase] = useState(item.revision);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (base !== item.revision && !busy) { setBase(item.revision); setDraft(toDraft(item)); }
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(item));

  async function save(next: Draft, quiet = false) {
    setBusy(true); setError("");
    try {
      const { item: saved } = await patch<{ item: MenuItem }>(`/api/lead/menu/${item.id}`, { expectedRevision: item.revision, change: toChange(next) });
      onSaved(saved); setBase(saved.revision); setDraft(toDraft(saved)); requestSync();
      if (!quiet) toast(<span><b>{saved.name}</b> saved · rev {saved.revision}</span>);
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "REVISION_CONFLICT") { setError("Someone else changed this drink. Loaded their version."); onConflict(); }
      else setError(cause instanceof Error ? cause.message : "Couldn't save.");
      setDraft(next);
    } finally { setBusy(false); }
  }

  return (
    <article className={cx("border p-5", !item.active ? "border-line bg-cream" : item.soldOut ? "border-ink" : "border-ink")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold tabular">{formatMoney(item.priceCents)}</span>
          {surchargeSummary(item) && <span className="text-xs text-mute">{surchargeSummary(item)}</span>}
          <span className="tag text-mute">rev {item.revision}</span>
          {item.soldOut && <span className="tag border-ink bg-ink text-paper">sold out</span>}
          {!item.active && <span className="tag text-mute">hidden</span>}
        </div>
        <div className="flex flex-wrap gap-4">
          <Switch checked={draft.soldOut} disabled={busy} label="sold out" onChange={soldOut => void save({ ...toDraft(item), soldOut }, true)} />
          <Switch checked={draft.active} disabled={busy} label="on menu" onChange={active => void save({ ...toDraft(item), active }, true)} />
        </div>
      </div>
      <DraftFields draft={draft} setDraft={setDraft} />
      {error && <Notice tone="bad" className="mt-4">{error}</Notice>}
      <div className="mt-4 flex items-center justify-end gap-2">
        {dirty && <button className="btn btn-text btn-sm" onClick={() => setDraft(toDraft(item))}>discard</button>}
        <button className="btn btn-solid btn-sm" disabled={!dirty || busy} onClick={() => void save(draft)}>{busy ? <Spinner /> : "save changes"}</button>
      </div>
    </article>
  );
}

function NewItem({ onCreated }: { onCreated: (item: MenuItem) => void }) {
  const [draft, setDraft] = useState<Draft>(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form className="p-6" onSubmit={async e => {
      e.preventDefault(); setBusy(true); setError("");
      try { const { item } = await post<{ item: MenuItem }>("/api/lead/menu", toChange(draft)); onCreated(item); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn't create it."); }
      finally { setBusy(false); }
    }}>
      <DraftFields draft={draft} setDraft={setDraft} />
      {error && <Notice tone="bad" className="mt-4">{error}</Notice>}
      <button className="btn btn-solid btn-lg mt-6 w-full" disabled={busy}>{busy ? <Spinner /> : "add to menu"}</button>
    </form>
  );
}

function DraftFields({ draft, setDraft }: { draft: Draft; setDraft: (d: Draft) => void }) {
  const [milk, setMilk] = useState("");
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft({ ...draft, [key]: value });
  const addMilk = () => {
    const value = milk.trim().toLowerCase();
    if (value && !draft.allowedMilk.includes(value) && draft.allowedMilk.length < 12) set("allowedMilk", [...draft.allowedMilk, value]);
    setMilk("");
  };
  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_140px]">
      <label className="field"><span>name</span><input className="input text-lg font-bold" value={draft.name} maxLength={60} required onChange={e => set("name", e.target.value)} /></label>
      <label className="field"><span>price · sgd</span><input className="input text-lg" inputMode="decimal" value={draft.price} required placeholder="6.50" onChange={e => set("price", e.target.value)} /></label>
      <label className="field sm:col-span-2"><span>description</span><input className="input" value={draft.description} maxLength={140} onChange={e => set("description", e.target.value)} /></label>
      <fieldset className="sm:col-span-2">
        <legend className="text-sm text-mute mb-2">category</legend>
        <div className="flex flex-wrap gap-2">
          {(["seasonal", "coffee", "not-coffee"] as const).map(c => <button key={c} type="button" className="opt" aria-pressed={draft.category === c} onClick={() => set("category", c)}>{c === "seasonal" ? "christmas special" : c.replace("-", " ")}</button>)}
        </div>
      </fieldset>
      <fieldset className="sm:col-span-2">
        <legend className="text-sm text-mute mb-2">milk options</legend>
        <div className="flex flex-wrap items-center gap-2">
          {draft.allowedMilk.map(m => (
            <span key={m} className="inline-flex items-center gap-1 border border-ink py-1 pl-3 pr-1 font-semibold">
              {m === "none" ? "black (none)" : m}
              {m !== "none" && (
                <label className="ml-1 inline-flex items-center gap-0.5 text-xs text-mute">+$
                  <input className="w-12 border-b border-line bg-transparent px-0.5 text-ink focus:border-ink focus:outline-none" inputMode="decimal" placeholder="0" aria-label={`${m} surcharge`}
                    value={draft.milkPrices[m] ?? ""} onChange={e => set("milkPrices", { ...draft.milkPrices, [m]: e.target.value })} />
                </label>
              )}
              <button type="button" className="grid h-7 w-7 place-items-center hover:text-bad" aria-label={`Remove ${m}`} onClick={() => set("allowedMilk", draft.allowedMilk.filter(x => x !== m))}><X className="h-3.5 w-3.5" /></button>
            </span>
          ))}
          <input className="input !min-h-10 w-32" placeholder="+ add" value={milk} maxLength={30} onChange={e => setMilk(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addMilk(); } }} onBlur={addMilk} />
        </div>
      </fieldset>
      <fieldset className="sm:col-span-2">
        <legend className="text-sm text-mute mb-2">served</legend>
        <div className="flex gap-2">
          {(["hot", "iced"] as const).map(t => (
            <button key={t} type="button" className="opt" aria-pressed={draft.allowedTemperatures.includes(t)}
              onClick={() => set("allowedTemperatures", draft.allowedTemperatures.includes(t) ? draft.allowedTemperatures.filter(x => x !== t) : [...draft.allowedTemperatures, t].sort() as Temperature[])}>
              {t === "hot" ? <Flame className="h-4 w-4" /> : <Snowflake className="h-4 w-4" />}{t}
            </button>
          ))}
          {draft.allowedTemperatures.includes("iced") && (
            <label className="ml-2 inline-flex items-center gap-1 text-sm text-mute">iced +$
              <input className="input !min-h-10 w-20" inputMode="decimal" placeholder="0.00" value={draft.iced} onChange={e => set("iced", e.target.value)} aria-label="Iced surcharge" />
            </label>
          )}
        </div>
        <p className="mt-2 text-xs text-mute">use the milk option “none” for black drinks: the order screen then skips the milk question.</p>
      </fieldset>
    </div>
  );
}
