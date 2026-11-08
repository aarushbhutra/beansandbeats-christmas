"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { Wordmark } from "@/components/brand/brand";
import { cx, Modal, Notice, Spinner, ToastProvider } from "@/components/ui/ui";
import { formatSgtTime } from "@/lib/domain/rules";
import { localDb } from "@/lib/client/db";
import { forgetThisTablet, requestSync, startEngine } from "@/lib/client/engine";
import { signOut, useDevice, useEngine, useIssues, useMenuSyncedAt, useNow, useOutbox, useProfile, verifySession } from "@/lib/client/hooks";
import { LoginForm } from "./login-form";

type Area = "orders" | "barista" | "lead";

export function StaffShell({ area, children, leadOnly = false, needsDevice = false, fullBleed = false }: { area: Area; children: ReactNode; leadOnly?: boolean; needsDevice?: boolean; fullBleed?: boolean }) {
  const profile = useProfile();
  const router = useRouter();
  const path = usePathname();
  useEffect(() => startEngine(), []);
  useEffect(() => { void verifySession(); }, []);
  useEffect(() => {
    if (profile === null) router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [profile, router, path]);

  if (!profile) return <div className="grid min-h-svh place-items-center text-mute"><Spinner className="h-5 w-5" /></div>;

  return (
    <ToastProvider>
      <div className="flex min-h-svh flex-col bg-paper">
        <Header area={area} />
        <Banners needsDevice={needsDevice} />
        {leadOnly && profile.role !== "lead" ? (
          <main className="grid flex-1 place-items-center p-8 text-center">
            <div>
              <h1 className="h-display text-5xl">leads only</h1>
              <p className="mt-3 text-mute">Menu, sales, tablets and team need a booth lead account.</p>
              <Link href="/orders" className="btn btn-solid mt-6">back to orders</Link>
            </div>
          </main>
        ) : (
          <main className={cx("flex-1", !fullBleed && "mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6")}>{children}</main>
        )}
      </div>
    </ToastProvider>
  );
}

function Header({ area }: { area: Area }) {
  const profile = useProfile();
  const device = useDevice();
  const router = useRouter();
  const links = [
    { href: "/orders", label: "orders", key: "orders" },
    { href: "/barista", label: "queue", key: "barista" },
    ...(profile?.role === "lead" ? [{ href: "/lead", label: "lead", key: "lead" }] : []),
  ];
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="beans&beats home" className="shrink-0"><span className="hidden sm:inline"><Wordmark /></span><span className="sm:hidden"><Wordmark size="sm" /></span></Link>
        <nav className="ml-auto flex items-center gap-4 sm:gap-6" aria-label="Staff">
          {links.map(link => (
            <Link key={link.key} href={link.href} aria-current={area === link.key ? "page" : undefined} className="nav-link">{link.label}</Link>
          ))}
          <a href="/ready" target="_blank" rel="noreferrer" className="nav-link hidden md:inline-flex">board</a>
        </nav>
        <div className="flex items-center gap-3 border-l border-line pl-4">
          <SyncStatus />
          {device && <span className="hidden text-sm text-mute lg:inline" title={device.label}>tablet {device.prefix}</span>}
          {profile && (
            <button className="hidden text-sm text-mute underline-offset-4 hover:text-ink hover:underline sm:inline" onClick={async () => { await signOut(); router.replace("/login"); }}>
              sign out
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function Banners({ needsDevice }: { needsDevice: boolean }) {
  const engine = useEngine();
  const device = useDevice();
  const profile = useProfile();
  const outbox = useOutbox();
  const [relogin, setRelogin] = useState(false);
  const banners: ReactNode[] = [];
  if (engine.auth === "expired") banners.push(
    <Notice key="auth" tone="dark" action={<button className="btn btn-outline btn-sm" onClick={() => setRelogin(true)}>sign in</button>}>
      Your session has expired. {outbox.count ? `${outbox.count} saved change${outbox.count === 1 ? "" : "s"} will sync after you sign in.` : "Sign in to keep syncing."}
    </Notice>);
  if (needsDevice && device === null) banners.push(
    <Notice key="device" tone="note" action={profile?.role === "lead" ? <Link href="/lead/devices" className="btn btn-solid btn-sm">register this tablet</Link> : undefined}>
      <b>This tablet isn&apos;t registered yet.</b> {profile?.role === "lead" ? "Register it once, while online, to take orders on it." : "Ask a booth lead to register it before taking orders."}
    </Notice>);
  if (engine.device === "missing") banners.push(
    <Notice key="missing" tone="dark" action={<button className="btn btn-outline btn-sm" onClick={async () => { await forgetThisTablet({ force: true }); window.location.href = profile?.role === "lead" ? "/lead/devices" : "/orders"; }}>clear this tablet</button>}>
      This tablet&apos;s registration no longer exists on the server (test data was reset). Clear it, then a booth lead registers it again.
    </Notice>);
  if (engine.device === "revoked") banners.push(<Notice key="revoked" tone="bad">This tablet was retired by a booth lead. Its saved data stays on it.</Notice>);
  if (outbox.blocked.length) banners.push(<Notice key="gap" tone="bad">Sync is paused at change #{outbox.blocked[0].seq}. {outbox.blocked[0].lastError ?? "A booth lead can review it under lead → tablets."}</Notice>);
  return (
    <>
      {banners.length > 0 && <div className="mx-auto grid w-full max-w-[1400px] gap-2 px-4 pt-3 sm:px-6">{banners}</div>}
      <Modal open={relogin && engine.auth === "expired"} onClose={() => setRelogin(false)} title="sign in again" labelledBy="relogin">
        <div className="p-5"><LoginForm onDone={() => setRelogin(false)} /></div>
      </Modal>
    </>
  );
}

/** Plain-text connection status, like a quiet nav item. Tap for details. */
export function SyncStatus() {
  const engine = useEngine();
  const outbox = useOutbox();
  const issues = useIssues();
  const [open, setOpen] = useState(false);
  const offline = !engine.online;
  const label = offline ? `offline${outbox.count ? ` · ${outbox.count} saved` : ""}`
    : issues.length ? `${issues.length} to review`
    : outbox.count ? `syncing ${outbox.count}`
    : "synced";
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label={`Sync status: ${label}`}
        className={cx("inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-sm font-bold", offline || issues.length ? "border-ink bg-ink text-paper" : "border-line text-ink")}>
        {engine.syncing && outbox.count ? <Spinner className="h-3 w-3" /> : <span className={cx("dot", offline ? "bg-paper" : issues.length ? "bg-paper" : engine.live === "open" ? "text-[#1f8a4c]" : "text-dim", offline && "pulse")} />}
        <span>{label}</span>
      </button>
      <SyncDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function SyncDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const engine = useEngine();
  const outbox = useOutbox();
  const issues = useIssues();
  const device = useDevice();
  const menuSyncedAt = useMenuSyncedAt();
  const now = useNow(5000);
  const ago = (iso: string | null) => (iso ? `${Math.max(0, Math.round((now - Date.parse(iso)) / 60000))} min ago` : "never");
  return (
    <Modal open={open} onClose={onClose} title="sync" labelledBy="sync-title">
      <div className="grid gap-5 p-5">
        <dl className="grid grid-cols-2 border-l border-t border-line text-sm">
          {[
            ["connection", engine.online ? "online" : "offline"],
            ["live updates", engine.live === "open" ? "connected" : engine.live === "retrying" ? "reconnecting" : "paused"],
            ["last sync", engine.lastSyncAt ? `${formatSgtTime(engine.lastSyncAt, true)}` : "not yet"],
            ["menu", menuSyncedAt ? `updated ${ago(menuSyncedAt)}` : "not loaded"],
            ["this tablet", device ? `${device.prefix} · ${device.label}` : "not registered"],
            ["waiting to sync", String(outbox.count)],
          ].map(([key, value]) => (
            <div key={key} className="border-b border-r border-line p-3"><dt className="label text-mute">{key}</dt><dd className="mt-0.5">{value}</dd></div>
          ))}
        </dl>
        {engine.lastError && <Notice tone="note">{engine.lastError}</Notice>}
        <p className="text-sm text-mute">
          Every change is saved on this tablet first, then sent in order. Retries reuse the same change ID, so nothing is counted twice.
          {outbox.oldest && ` Oldest waiting change: ${ago(outbox.oldest)}.`}
        </p>
        {issues.length > 0 && (
          <section>
            <h3 className="h-title text-xl">needs review</h3>
            <ul className="mt-2 grid gap-2">
              {issues.map(issue => (
                <li key={issue.id} className="flex items-start justify-between gap-3 border border-ink p-3 text-sm">
                  <div>
                    <div className="font-bold">{issue.publicNumber ?? "order"} · {issue.code.toLowerCase().replace(/_/g, " ")}</div>
                    <div className="mt-0.5 text-mute">{issue.message}</div>
                  </div>
                  <button className="btn btn-outline btn-sm shrink-0" onClick={() => void localDb.issues.delete(issue.id)}>dismiss</button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <button className="btn btn-solid" onClick={() => requestSync()} disabled={!engine.online || engine.syncing}>
          {engine.syncing ? <Spinner /> : <RefreshCw className="h-4 w-4" />} sync now
        </button>
      </div>
    </Modal>
  );
}
