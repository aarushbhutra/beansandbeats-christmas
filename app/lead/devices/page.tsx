"use client";
import { Check, Tablet, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { cx, Notice, Spinner, useToast } from "@/components/ui/ui";
import { ApiError, post } from "@/lib/client/api";
import { forgetThisTablet, registerThisTablet } from "@/lib/client/engine";
import { useProfile } from "@/lib/client/hooks";
import { useDevice, useNow, useOutbox } from "@/lib/client/hooks";
import { useApi } from "@/lib/client/use-api";
import { formatSgtTime } from "@/lib/domain/rules";
import type { Device } from "@/lib/domain/types";

type Overview = {
  devices: (Device & { orders: number; lastOrderAt: string | null })[];
  issues: { id: string; prefix: string; publicNumber: string | null; kind: string; code: string; message: string; createdAt: string }[];
};

export default function DevicesPage() {
  const { data, error, reload } = useApi<Overview>("/api/lead/devices");
  const toast = useToast();
  const now = useNow(10_000);
  const run = async (fn: () => Promise<unknown>, done: string) => {
    try { await fn(); toast(done); await reload(); } catch (e) { toast(e instanceof ApiError || e instanceof Error ? e.message : "Failed", "bad"); }
  };
  return (
    <div className="grid gap-8">
      <div>
        <p className="text-sm text-mute">booth lead · tablets &amp; sync</p>
        <h1 className="h-display mt-1 text-[2.6rem]">tablets</h1>
        <p className="mt-3 max-w-2xl text-mute">every tablet gets its own letter, so order numbers never collide, even offline. tablets report how many changes they still hold; reports stay provisional until every active tablet says zero.</p>
      </div>
      <ThisTablet onChange={reload} />
      {error && <Notice tone="note">{error.status === 0 ? "Offline: tablet status needs a connection." : error.message}</Notice>}

      <section>
        <h2 className="h-title text-3xl">registered tablets</h2>
        <div className="mt-3 overflow-x-auto border border-ink scroll-thin">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-ink text-xs text-paper"><tr>{["tablet", "label", "last seen", "unsynced", "orders", "next #", ""].map(h => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {(data?.devices ?? []).map(d => {
                const seen = d.lastSeenAt ? Math.round((now - Date.parse(d.lastSeenAt)) / 60000) : null;
                return (
                  <tr key={d.id} className={cx("border-t border-line", d.revokedAt && "text-dim")}>
                    <td className="px-4 py-3"><span className={cx("grid h-10 w-10 place-items-center text-lg font-bold", d.revokedAt ? "bg-smoke" : "bg-ink text-paper")}>{d.prefix}</span></td>
                    <td className="px-4 py-3 font-semibold">{d.label}{d.revokedAt && <span className="ml-2 tag">retired</span>}</td>
                    <td className="px-4 py-3 text-xs">{seen === null ? "never" : seen < 1 ? "just now" : `${seen} min ago`}</td>
                    <td className="px-4 py-3">
                      {d.gapExpected ? <span className="tag text-bad">gap at #{d.gapExpected}</span> : d.pendingOps === null ? <span className="tag text-mute">unknown</span> : d.pendingOps ? <span className="tag text-ink">{d.pendingOps}</span> : <span className="tag text-ink"><Check className="h-3 w-3" /> 0</span>}
                    </td>
                    <td className="px-4 py-3 tabular">{d.orders}</td>
                    <td className="px-4 py-3 tabular">{d.nextSequence}</td>
                    <td className="px-4 py-3 text-right">
                      {!d.revokedAt && (
                        <div className="flex justify-end gap-2">
                          {d.gapExpected && <button className="btn btn-solid btn-sm" onClick={() => { if (confirm(`Skip tablet ${d.prefix}'s missing changes? They were lost on the tablet and cannot be recovered.`)) void run(() => post(`/api/lead/devices/${d.id}`, { action: "skip-gap" }), "gap skipped"); }}>skip gap</button>}
                          <button className="btn btn-outline btn-sm" onClick={() => { const label = prompt("New label", d.label); if (label) void run(() => post(`/api/lead/devices/${d.id}`, { action: "rename", label }), "renamed"); }}>rename</button>
                          <button className="btn btn-outline btn-sm hover:!bg-bad hover:!border-bad" onClick={() => { if (confirm(`Retire tablet ${d.prefix}? It will stop syncing. Its letter is never reused.`)) void run(() => post(`/api/lead/devices/${d.id}`, { action: "revoke" }), "tablet retired"); }}>retire</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {data && !data.devices.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-mute">no tablets registered yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <ResetData onDone={reload} />

      <section>
        <h2 className="h-title text-3xl">sync conflicts</h2>
        <p className="mt-1 text-sm text-mute">changes the server refused. each one was recorded and skipped so the tablet kept going. fix the order on the bar queue if needed, then mark it handled.</p>
        <ul className="mt-3 grid gap-2">
          {(data?.issues ?? []).map(issue => (
            <li key={issue.id} className="flex flex-wrap items-start justify-between gap-3 border border-bad/40 p-4">
              <div>
                <div className="flex items-center gap-2 text-xs text-bad"><TriangleAlert className="h-3.5 w-3.5" /> tablet {issue.prefix} · {issue.kind} · {issue.publicNumber ?? "unknown order"} · {formatSgtTime(issue.createdAt)}</div>
                <p className="mt-1 text-sm">{issue.message}</p>
              </div>
              <button className="btn btn-outline btn-sm" onClick={() => void run(() => post(`/api/lead/issues/${issue.id}`, {}), "marked handled")}>mark handled</button>
            </li>
          ))}
          {data && !data.issues.length && <li className="border border-line p-8 text-center text-sm text-mute">no open conflicts.</li>}
        </ul>
      </section>
    </div>
  );
}

function ThisTablet({ onChange }: { onChange: () => void }) {
  const device = useDevice();
  const outbox = useOutbox();
  const toast = useToast();
  const [label, setLabel] = useState("counter ipad");
  const [busy, setBusy] = useState(false);
  if (device === undefined) return null;
  return (
    <section className={cx("grid gap-4 border p-6 sm:grid-cols-[auto_1fr] sm:items-center", device ? "border-ink" : "border-ink bg-paper")}>
      <span className={cx("grid h-20 w-20 place-items-center text-4xl font-bold", device ? "bg-ink text-paper" : "bg-ink text-paper")}>{device ? device.prefix : <Tablet className="h-9 w-9" />}</span>
      {device ? (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="h-title text-3xl">this tablet is {device.prefix}</h2>
            <p className="mt-1 text-sm text-mute">“{device.label}” · registered {formatSgtTime(device.registeredAt)} · next change #{device.nextSeq} · {outbox.count} waiting to sync</p>
          </div>
          <button className="btn btn-outline btn-sm" disabled={busy} onClick={async () => {
            if (!confirm("Forget this tablet's registration? Only do this when replacing or wiping it. You'll need to register again (new letter).")) return;
            setBusy(true);
            try { await forgetThisTablet(); toast("tablet registration removed"); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "bad"); } finally { setBusy(false); }
          }}>forget this tablet</button>
        </div>
      ) : (
        <form className="flex flex-wrap items-end gap-3" onSubmit={async e => {
          e.preventDefault(); setBusy(true);
          try { const d = await registerThisTablet(label); toast(`registered as tablet ${d.prefix}`); onChange(); }
          catch (err) { toast(err instanceof Error ? err.message : "Registration failed", "bad"); }
          finally { setBusy(false); }
        }}>
          <div className="w-full"><h2 className="h-title text-3xl">register this tablet</h2><p className="mt-1 text-sm text-mute">one time, online. it gets a letter and its own order-number range, then works offline.</p></div>
          <label className="field min-w-56 flex-1"><span>label</span><input className="input" value={label} maxLength={40} required onChange={e => setLabel(e.target.value)} /></label>
          <button className="btn btn-solid" disabled={busy}>{busy ? <Spinner /> : "register"}</button>
        </form>
      )}
    </section>
  );
}

/** Clears dry-run data before the event. Staff accounts and the menu are kept. */
function ResetData({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const profile = useProfile();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  if (profile?.role !== "lead") return null;
  return (
    <section className="border border-line p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="h-title text-2xl">reset test data</h2>
          <p className="mt-1 max-w-2xl text-sm text-mute">After a test run or the dry run: deletes every order, tablet registration and sync record. Staff accounts and the menu stay. Never use this during the event; set DISABLE_DATA_RESET=true to lock it.</p>
        </div>
        {!open && <button className="btn btn-outline btn-sm" onClick={() => setOpen(true)}>reset…</button>}
      </div>
      {open && (
        <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={async e => {
          e.preventDefault(); setBusy(true);
          try {
            const result = await post<{ orders: number; devices: number }>("/api/lead/reset", { confirm: text.trim().toLowerCase() });
            await forgetThisTablet({ force: true });
            toast(`reset done: ${result.orders} orders and ${result.devices} tablets removed`);
            setOpen(false); setText(""); onDone();
          } catch (error) { toast(error instanceof Error ? error.message : "Reset failed", "bad"); }
          finally { setBusy(false); }
        }}>
          <label className="field min-w-56 flex-1"><span>type “reset” to confirm</span><input className="input" value={text} onChange={e => setText(e.target.value)} autoFocus /></label>
          <button className="btn btn-solid" disabled={busy || text.trim().toLowerCase() !== "reset"}>{busy ? <Spinner /> : "delete test data"}</button>
          <button type="button" className="btn btn-text" onClick={() => setOpen(false)}>cancel</button>
        </form>
      )}
    </section>
  );
}
