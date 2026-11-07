"use client";
import { Camera, Check, Keyboard, ScanLine } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cx, Modal, Notice, Spinner, useToast } from "@/components/ui/ui";
import { localDb, type LocalOrder } from "@/lib/client/db";
import { requestSync } from "@/lib/client/engine";
import { changeLocalStatus, LocalWriteError } from "@/lib/client/outbox";
import { eventDay, formatSgtTime, milkLabel, parseCollectCode } from "@/lib/domain/rules";

type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type Result = { code: string; order: LocalOrder | null };

/**
 * Pickup flow confirmed with the organiser: the guest shows the pickup QR from their phone,
 * the bar tablet/laptop camera scans it, and one tap hands it over (marks collected).
 */
export function PickupScanner({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [camera, setCamera] = useState<"starting" | "on" | "blocked" | "unsupported">("starting");
  const [result, setResult] = useState<Result | null>(null);
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);

  const lookup = useCallback(async (raw: string) => {
    const code = parseCollectCode(raw);
    if (!code) { toast("That isn't a beans&beats pickup code.", "bad"); return; }
    const today = await localDb.orders.where("eventDay").equals(eventDay()).toArray();
    const order = today.find(o => o.publicNumber === code || o.shortNumber === code) ?? null;
    try { navigator.vibrate?.(60); } catch { /* optional */ }
    setResult({ code, order });
  }, [toast]);

  useEffect(() => {
    if (!open || result) return;
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setCamera("unsupported"); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false });
      } catch { setCamera("blocked"); return; }
      if (stopped || !video.current) { stream.getTracks().forEach(t => t.stop()); return; }
      video.current.srcObject = stream;
      await video.current.play().catch(() => {});
      setCamera("on");
      const Native = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
      const detector = Native ? new Native({ formats: ["qr_code"] }) : null;
      const { default: jsQR } = detector ? { default: null } : await import("jsqr");
      const tick = async () => {
        if (stopped || !video.current) return;
        const v = video.current;
        try {
          if (v.readyState >= 2 && v.videoWidth) {
            let value: string | undefined;
            if (detector) value = (await detector.detect(v))[0]?.rawValue;
            else if (jsQR) {
              canvas.current ??= document.createElement("canvas");
              const scale = Math.min(1, 640 / v.videoWidth);
              const w = Math.round(v.videoWidth * scale), h = Math.round(v.videoHeight * scale);
              canvas.current.width = w; canvas.current.height = h;
              const ctx = canvas.current.getContext("2d", { willReadFrequently: true })!;
              ctx.drawImage(v, 0, 0, w, h);
              value = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" })?.data;
            }
            if (value) { await lookup(value); return; }
          }
        } catch { /* keep scanning */ }
        timer = setTimeout(() => void tick(), 180);
      };
      void tick();
    })();
    return () => { stopped = true; clearTimeout(timer); stream?.getTracks().forEach(t => t.stop()); };
  }, [open, result, lookup]);

  useEffect(() => { if (!open) { setResult(null); setManual(""); setCamera("starting"); } }, [open]);

  async function handOver(order: LocalOrder) {
    setBusy(true);
    try {
      await changeLocalStatus(order.id, "collected");
      requestSync();
      toast(<span><b>{order.shortNumber}</b> collected</span>);
      setResult(null);
    } catch (error) {
      toast(error instanceof LocalWriteError ? error.message : "Couldn't save that.", "bad");
    } finally { setBusy(false); }
  }

  const order = result?.order;
  return (
    <Modal open={open} onClose={onClose} title="scan pickup" labelledBy="scan-title" wide>
      <div className="grid gap-5 p-6 sm:grid-cols-[1.1fr_1fr]">
        <div className="relative aspect-[4/3] overflow-hidden bg-ink">
          {!result && <video ref={video} className="h-full w-full object-cover" muted playsInline aria-label="Camera preview" />}
          {!result && camera === "on" && (
            <div className="pointer-events-none absolute inset-[18%] border-2 border-paper">
              <ScanLine className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 pulse text-paper" />
            </div>
          )}
          {!result && camera === "starting" && <div className="absolute inset-0 grid place-items-center text-paper"><Spinner className="h-6 w-6" /></div>}
          {!result && (camera === "blocked" || camera === "unsupported") && (
            <div className="absolute inset-0 grid place-items-center p-6 text-center text-paper">
              <div><Camera className="mx-auto h-8 w-8 text-paper" /><p className="mt-3 text-sm">{camera === "blocked" ? "camera blocked. allow camera access for this site (needs https), or type the number." : "this browser can't use the camera here. type the number instead."}</p></div>
            </div>
          )}
          {result && (
            <div className={cx("absolute inset-0 flex flex-col justify-center p-6", order?.status === "ready" ? "bg-ink text-paper" : "bg-wash text-ink")}>
              <div className="text-6xl font-bold tracking-[-0.06em]">{order?.shortNumber ?? result.code}</div>
              <div className="mt-2 text-2xl font-bold tracking-[-0.04em]">{order?.firstName ?? ""}</div>
              <div className="mt-2 text-sm opacity-80">
                {!order ? "not on this tablet yet" : order.status === "ready" ? "ready to hand over" : order.status === "collected" ? `already collected${order.collectedAt ? ` at ${formatSgtTime(order.collectedAt)}` : ""}` : order.status === "cancelled" ? "cancelled order" : `still ${order.status === "making" ? "being made" : "in the queue"}`}
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-4">
          {!result ? (
            <>
              <p className="text-sm text-mute">point the guest&apos;s phone at the camera. their pickup qr appears on their order page once the drink is ready.</p>
              <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (manual.trim()) void lookup(manual); }}>
                <label className="field flex-1"><span className="inline-flex items-center gap-1"><Keyboard className="h-3 w-3" /> or type the number</span><input className="input text-lg uppercase" placeholder="A-042" value={manual} onChange={e => setManual(e.target.value)} /></label>
                <button className="btn btn-solid self-end">find</button>
              </form>
            </>
          ) : (
            <>
              {order ? (
                <ul className="grid gap-1.5">
                  {order.items.map((item, i) => <li key={i} className="flex gap-2 font-semibold"><span>{item.quantity}×</span>{item.nameSnapshot}<span className="ml-auto text-sm text-mute">{milkLabel(item.milk)} · {item.temperature}</span></li>)}
                </ul>
              ) : <Notice tone="note">no order {result.code} on this tablet for today. if it was just taken on another tablet, wait for sync or check the number.</Notice>}
              {order?.status === "ready" && (
                <button className="btn btn-solid btn-lg" disabled={busy} onClick={() => void handOver(order)} autoFocus>
                  {busy ? <Spinner /> : <><Check className="h-5 w-5" /> handed over</>}
                </button>
              )}
              <button className="btn btn-outline" onClick={() => setResult(null)}>scan next</button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
