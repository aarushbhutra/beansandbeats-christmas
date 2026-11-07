"use client";
import { Plus } from "lucide-react";
import { useState } from "react";
import { cx, Modal, Notice, Spinner, useToast } from "@/components/ui/ui";
import { ApiError, patch, post } from "@/lib/client/api";
import { useProfile } from "@/lib/client/hooks";
import { useApi } from "@/lib/client/use-api";
import type { Role } from "@/lib/domain/types";

type Member = { id: string; username: string; displayName: string; role: Role; active: boolean; createdAt: string; lastSeenAt: string | null };

export default function TeamPage() {
  const { data, error, reload } = useApi<{ staff: Member[] }>("/api/lead/staff");
  const me = useProfile();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<Member | null>(null);
  const update = async (member: Member, change: Record<string, unknown>, done: string) => {
    try { await patch(`/api/lead/staff/${member.id}`, change); toast(done); await reload(); }
    catch (e) { toast(e instanceof ApiError ? e.message : "Failed", "bad"); }
  };
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-mute">booth lead · team</p>
          <h1 className="h-display mt-1 text-[2.6rem]">team</h1>
          <p className="mt-3 max-w-xl text-mute">baristas take orders and run the bar. leads also edit the menu, see reports and manage tablets. role or password changes sign that person out everywhere.</p>
        </div>
        <button className="btn btn-solid" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> add someone</button>
      </div>
      {error && <Notice tone="note">{error.message}</Notice>}
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(data?.staff ?? []).map(member => (
          <li key={member.id} className={cx("border p-5", member.active ? "border-ink" : "border-line bg-cream text-mute")}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="h-title text-2xl">{member.displayName}</div>
                <div className="text-xs text-mute">@{member.username}{member.id === me?.id ? " · you" : ""}</div>
              </div>
              <span className={cx("tag", member.role === "lead" ? "border-ink bg-ink text-paper" : "text-mute")}>{member.role === "lead" ? "booth lead" : "barista"}</span>
            </div>
            <p className="mt-3 text-xs text-mute">{member.active ? (member.lastSeenAt ? `last active ${new Date(member.lastSeenAt).toLocaleString("en-SG", { timeZone: "Asia/Singapore", dateStyle: "medium", timeStyle: "short" })}` : "never signed in") : "deactivated"}</p>
            {member.id !== me?.id && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="btn btn-outline btn-sm" onClick={() => setResetting(member)}>reset password</button>
                <button className="btn btn-outline btn-sm" onClick={() => void update(member, { role: member.role === "lead" ? "barista" : "lead" }, "role updated")}>make {member.role === "lead" ? "barista" : "lead"}</button>
                <button className="btn btn-outline btn-sm" onClick={() => void update(member, { active: !member.active }, member.active ? "deactivated" : "reactivated")}>{member.active ? "deactivate" : "reactivate"}</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <Modal open={adding} onClose={() => setAdding(false)} title="add a crew member" labelledBy="add-staff">
        <AddStaff onDone={() => { setAdding(false); void reload(); toast("account created · share the password in person"); }} />
      </Modal>
      <Modal open={Boolean(resetting)} onClose={() => setResetting(null)} title={resetting ? `new password for ${resetting.displayName}` : ""} labelledBy="reset-pw">
        {resetting && <ResetPassword member={resetting} onDone={() => { setResetting(null); toast("password reset · they've been signed out"); }} />}
      </Modal>
    </div>
  );
}

function generatePassword(): string {
  const words = ["latte", "vinyl", "mocha", "drop", "bassline", "crema", "groove", "tinsel", "pour", "remix", "cocoa", "encore"];
  const pick = () => words[crypto.getRandomValues(new Uint32Array(1))[0] % words.length];
  return `${pick()}-${pick()}-${pick()}-${crypto.getRandomValues(new Uint32Array(1))[0] % 90 + 10}`;
}

function AddStaff({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ displayName: "", username: "", role: "barista" as Role, password: generatePassword() });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form className="grid gap-4 p-6" onSubmit={async e => {
      e.preventDefault(); setBusy(true); setError("");
      try { await post("/api/lead/staff", form); onDone(); } catch (cause) { setError(cause instanceof ApiError ? cause.message : "Couldn't create the account."); } finally { setBusy(false); }
    }}>
      <label className="field"><span>display name</span><input className="input" required maxLength={60} value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value, username: form.username || e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "") })} /></label>
      <label className="field"><span>username</span><input className="input" required pattern="[a-z0-9._\-]{2,32}" value={form.username} onChange={e => setForm({ ...form, username: e.target.value.toLowerCase() })} /></label>
      <fieldset><legend className="text-sm text-mute mb-2">role</legend><div className="flex gap-2">{(["barista", "lead"] as const).map(r => <button key={r} type="button" className="opt" aria-pressed={form.role === r} onClick={() => setForm({ ...form, role: r })}>{r === "lead" ? "booth lead" : "barista"}</button>)}</div></fieldset>
      <label className="field"><span>temporary password</span><input className="input" required minLength={10} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></label>
      <p className="text-xs text-mute">share it in person, never in a group chat. it isn&apos;t shown again.</p>
      {error && <Notice tone="bad">{error}</Notice>}
      <button className="btn btn-solid btn-lg" disabled={busy}>{busy ? <Spinner /> : "create account"}</button>
    </form>
  );
}

function ResetPassword({ member, onDone }: { member: Member; onDone: () => void }) {
  const [password, setPassword] = useState(generatePassword());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form className="grid gap-4 p-6" onSubmit={async e => {
      e.preventDefault(); setBusy(true); setError("");
      try { await patch(`/api/lead/staff/${member.id}`, { password }); onDone(); } catch (cause) { setError(cause instanceof ApiError ? cause.message : "Couldn't reset."); } finally { setBusy(false); }
    }}>
      <label className="field"><span>new password</span><input className="input" required minLength={10} value={password} onChange={e => setPassword(e.target.value)} /></label>
      {error && <Notice tone="bad">{error}</Notice>}
      <button className="btn btn-solid" disabled={busy}>{busy ? <Spinner /> : "set password"}</button>
    </form>
  );
}
