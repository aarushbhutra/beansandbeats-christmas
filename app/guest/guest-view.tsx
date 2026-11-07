"use client";
import { AnimatePresence, motion } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import { Bell, BellRing, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CoBrand, Wordmark } from "@/components/brand/brand";
import { cx, Spinner } from "@/components/ui/ui";
import { api, ApiError, subscribe } from "@/lib/client/api";
import { COLLECT_PREFIX, formatSgtTime } from "@/lib/domain/rules";
import type { GuestStatus } from "@/lib/domain/types";

const STEPS: { key: GuestStatus["status"]; label: string }[] = [
  { key: "queued", label: "Received" },
  { key: "making", label: "Making" },
];

function readToken(): string | null {
  const hash = window.location.hash.slice(1);
  const token = new URLSearchParams(hash).get("t") ?? hash;
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

async function cacheKey(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return "bb-guest:" + Array.from(new Uint8Array(digest).slice(0, 12), b => b.toString(16).padStart(2, "0")).join("");
}

/** "Mei, oat iced flat white" — same phrasing as the organiser's mockup. */
function describe(status: GuestStatus): string {
  const drinks = status.items.map(item => `${item.quantity > 1 ? `${item.quantity}× ` : ""}${item.milk === "oat" ? "oat " : ""}${item.temperature === "iced" ? "iced " : ""}${item.nameSnapshot}`).join(", ");
  return status.firstName ? `${status.firstName}, ${drinks}` : drinks;
}

export function GuestView() {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const update = () => setToken(readToken());
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  if (token === undefined) return <Frame><div className="grid min-h-[50svh] place-items-center text-mute"><Spinner className="h-5 w-5" /></div></Frame>;
  if (!token) return <Landing />;
  return <Tracker key={token} token={token} />;
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-paper">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-md items-center justify-between px-5"><Wordmark size="sm" /><span className="text-sm text-mute">christmas together</span></div>
      </header>
      <main className="mx-auto max-w-md px-5 pb-16 pt-8">{children}</main>
    </div>
  );
}

function Landing() {
  return (
    <Frame>
      <p className="text-sm text-mute">beans&amp;beats café</p>
      <h1 className="h-display mt-1 text-[2.6rem]">follow your order</h1>
      <p className="mt-3 text-mute">Order at the counter, then scan the QR code the barista shows you. Your order opens right here: no app, no sign-up.</p>
      <ol className="mt-8 divide-y divide-line border-y border-line">
        {["Order and pay at the counter (PayNow or card).", "Scan the QR code on the counter screen.", "Keep this page open. We'll buzz your phone when it's ready, then show your pickup code at the counter."].map((step, i) => (
          <li key={i} className="flex gap-4 py-4"><span className="font-bold">{i + 1}</span><span>{step}</span></li>
        ))}
      </ol>
      <p className="mt-6 text-sm text-mute">Your first name appears on the ready board until you collect, then it&apos;s deleted.</p>
    </Frame>
  );
}

function Tracker({ token }: { token: string }) {
  const [status, setStatus] = useState<GuestStatus | null>(null);
  const [problem, setProblem] = useState<"missing" | "offline" | null>(null);
  const [live, setLive] = useState<"open" | "retrying" | "closed">("closed");
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [sound, setSound] = useState(false);
  const [alerting, setAlerting] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const previous = useRef<GuestStatus["status"] | null>(null);
  const key = useRef<string>("");

  const accept = useCallback((next: GuestStatus | null) => {
    if (!next) { setProblem("missing"); return; }
    setProblem(null);
    setStatus(next);
    setLastUpdate(Date.now());
    try { if (key.current) localStorage.setItem(key.current, JSON.stringify({ at: Date.now(), status: next })); } catch { /* optional */ }
  }, []);

  const refresh = useCallback(async () => {
    try { accept(await api<GuestStatus>("/api/guest/status", { headers: { Authorization: `Bearer ${token}` } })); }
    catch (error) { setProblem(error instanceof ApiError && (error.status === 404 || error.status === 401) ? "missing" : "offline"); }
  }, [accept, token]);

  useEffect(() => {
    let stop = () => {};
    let poll: ReturnType<typeof setInterval>;
    void (async () => {
      key.current = await cacheKey(token);
      try {
        const cached = JSON.parse(localStorage.getItem(key.current) ?? "null");
        if (cached && Date.now() - cached.at < 12 * 3600_000) { setStatus(cached.status); previous.current = cached.status.status; setLastUpdate(cached.at); }
      } catch { /* ignore */ }
      await refresh();
      stop = subscribe("/api/guest/live", { headers: { Authorization: `Bearer ${token}` }, onEvent: (event, data) => { if (event === "status") accept(data as GuestStatus | null); }, onState: setLive });
      poll = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 12_000);
    })();
    const wake = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    return () => { stop(); clearInterval(poll); document.removeEventListener("visibilitychange", wake); window.removeEventListener("online", wake); };
  }, [token, refresh, accept]);

  const chime = useCallback(() => {
    const ctx = audio.current;
    if (!ctx || ctx.state !== "running") return;
    [659.25, 880, 1318.5].forEach((f, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain(); const s = ctx.currentTime + i * 0.16;
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.2, s + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.6);
      o.connect(g).connect(ctx.destination); o.start(s); o.stop(s + 0.62);
    });
  }, []);

  useEffect(() => {
    if (!status) return;
    const was = previous.current;
    previous.current = status.status;
    if (status.status === "ready" && was !== "ready") {
      setAlerting(true);
      try { navigator.vibrate?.([250, 100, 250, 100, 400]); } catch { /* optional */ }
      if (sound) chime();
    }
    if (status.status !== "ready") setAlerting(false);
  }, [status, sound, chime]);

  useEffect(() => {
    if (status?.status !== "ready") { document.title = status ? `order ${status.shortNumber} · beans&beats` : "your order · beans&beats"; return; }
    let on = false;
    const id = setInterval(() => { on = !on; document.title = on ? `● READY · ${status.shortNumber}` : `order ${status.shortNumber} is ready`; }, 1000);
    return () => clearInterval(id);
  }, [status]);

  async function toggleSound() {
    if (sound) { setSound(false); return; }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audio.current ??= new Ctor();
    await audio.current.resume().catch(() => {});
    if (audio.current.state === "running") { setSound(true); chime(); }
    try { await (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<unknown> } }).wakeLock?.request("screen"); } catch { /* optional */ }
  }

  if (!status) {
    return (
      <Frame>
        <p className="text-sm text-mute">beans&amp;beats café</p>
        <h1 className="h-display mt-1 text-[2.4rem]">{problem === "missing" ? "almost there" : problem === "offline" ? "no connection" : "finding your order"}</h1>
        <p className="mt-3 text-mute">
          {problem === "missing" ? "Your order is saved on the counter tablet and appears here as soon as it syncs. This page checks automatically." : problem === "offline" ? "Check your connection. We'll keep trying." : "One moment."}
        </p>
        {problem ? <button className="btn btn-outline mt-6" onClick={() => void refresh()}><RefreshCw className="h-4 w-4" /> check again</button> : <Spinner className="mt-6 h-5 w-5" />}
      </Frame>
    );
  }

  const stale = live !== "open" && (!lastUpdate || Date.now() - lastUpdate > 30_000);
  const reached = (key: GuestStatus["status"]) => ["queued", "making", "ready", "collected"].indexOf(status.status) >= ["queued", "making", "ready", "collected"].indexOf(key);
  const isReady = status.status === "ready";
  return (
    <Frame>
      <p className="text-sm text-mute">beans&amp;beats café</p>
      <h1 className="mt-1 text-[2.75rem] font-bold leading-none tracking-[-0.055em]">Order {status.shortNumber}</h1>
      <p className="mt-2 text-mute">{describe(status)}</p>

      {status.status === "cancelled" ? (
        <div className="mt-8 border border-ink p-4">This order was cancelled. Please speak to the team at the counter.</div>
      ) : status.status === "collected" ? (
        <div className="mt-8"><p className="h-title text-2xl">collected. enjoy the set.</p><p className="mt-2 text-sm text-mute">Thanks for supporting the charity café.</p></div>
      ) : (
        <>
          <ul className="mt-8 grid gap-4">
            {STEPS.map(step => (
              <li key={step.key} className="flex items-center gap-3 text-lg">
                <span className={cx("h-3.5 w-3.5 rounded-full border border-ink", reached(step.key) ? "bg-ink" : "bg-paper", step.key === status.status && !isReady && "pulse")} />
                <span className={reached(step.key) ? "text-ink" : "text-dim"}>{step.label}</span>
                {step.key === status.status && status.status === "queued" && <span className="ml-auto text-sm text-mute">{status.ahead === 0 ? "you're next" : `${status.ahead} ahead`}</span>}
              </li>
            ))}
          </ul>
          <div className={cx("mt-6 flex h-14 items-center justify-center rounded-full border text-lg font-bold tracking-[-0.03em] transition-colors", isReady ? "border-ink bg-ink text-paper" : "border-line text-dim")}>
            Ready to collect
          </div>
          <p className="mt-4 text-sm text-mute">
            {isReady ? "Your drink is ready. Pick it up at the counter and enjoy the set."
              : status.etaMinutes !== null ? `About ${status.etaMinutes} min. We'll buzz your phone when it's ready.` : "We'll buzz your phone when it's ready."}
          </p>
          {isReady && <PickupCode publicNumber={status.publicNumber} className="mt-6" />}
          {!isReady && (
            <button className={cx("btn btn-sm mt-6", sound ? "btn-solid" : "btn-outline")} onClick={() => void toggleSound()} aria-pressed={sound}>
              {sound ? <><BellRing className="h-4 w-4" /> sound alert on</> : <><Bell className="h-4 w-4" /> turn on sound alert</>}
            </button>
          )}
        </>
      )}

      <p className="mt-8 border-t border-line pt-4 text-xs text-mute" role="status">
        {stale ? `Reconnecting. Showing the last update${lastUpdate ? ` from ${formatSgtTime(new Date(lastUpdate), true)}` : ""}.` : `Live · updated ${lastUpdate ? formatSgtTime(new Date(lastUpdate), true) : "now"}`}
        {" "}Keep this page open: phones may pause updates when locked. No SMS or push messages are sent.
      </p>

      <AnimatePresence>
        {alerting && (
          <motion.div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-ink p-8 text-center text-paper" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="alertdialog" aria-labelledby="ready-title">
            <CoBrand light />
            <p className="text-paper/70">your drink is ready</p>
            <motion.h2 id="ready-title" className="text-[4.5rem] font-bold leading-none tracking-[-0.06em]" animate={{ opacity: [1, 0.8, 1] }} transition={{ repeat: Infinity, duration: 1.4 }}>{status.shortNumber}</motion.h2>
            <PickupCode publicNumber={status.publicNumber} />
            <p className="max-w-xs text-paper/80">Show this at the counter to collect.</p>
            <button className="btn btn-outline btn-lg" onClick={() => setAlerting(false)} autoFocus>got it</button>
          </motion.div>
        )}
      </AnimatePresence>
    </Frame>
  );
}

/** Pickup code: the bar tablet's camera scans it to hand over the drink and mark it collected. */
function PickupCode({ publicNumber, className = "" }: { publicNumber: string; className?: string }) {
  return (
    <div className={cx("inline-flex items-center gap-4 border border-ink bg-paper p-3 text-left text-ink", className)}>
      <QRCodeSVG value={`${COLLECT_PREFIX}${publicNumber}`} size={128} level="M" marginSize={1} title={`Pickup code for ${publicNumber}`} />
      <div className="max-w-[9rem]">
        <div className="label">pickup code</div>
        <div className="mt-1 text-sm leading-snug">Show this at the counter. We scan it and hand you your drink.</div>
      </div>
    </div>
  );
}
