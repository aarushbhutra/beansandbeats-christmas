"use client";
import { AnimatePresence, motion } from "motion/react";
import { Minus, Plus, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/* ---------- Modal ---------- */

export function Modal({ open, onClose, title, children, wide = false, dark = false, labelledBy }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; wide?: boolean; dark?: boolean; labelledBy?: string }) {
  const panel = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Everything behind the dialog becomes inert: unfocusable and hidden from assistive tech.
    const siblings = Array.from(document.body.children).filter(el => el !== root.current && !el.hasAttribute("inert")) as HTMLElement[];
    siblings.forEach(el => el.setAttribute("inert", ""));
    setTimeout(() => panel.current?.querySelector<HTMLElement>("[autofocus], input, button")?.focus(), 30);
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; siblings.forEach(el => el.removeAttribute("inert")); previous?.focus?.(); };
  }, [open, onClose]);
  if (!mounted) return null;
  return createPortal(
    <div ref={root}>
      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <button aria-label="Close" className="absolute inset-0 cursor-default bg-ink/45" onClick={onClose} tabIndex={-1} />
            <motion.div
              ref={panel} role="dialog" aria-modal="true" aria-labelledby={labelledBy}
              className={cx("relative max-h-[92svh] w-full overflow-y-auto scroll-thin border border-ink", wide ? "sm:max-w-3xl" : "sm:max-w-lg", dark ? "bg-ink text-paper" : "bg-paper text-ink")}
              initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }} transition={{ duration: 0.18, ease: "easeOut" }}
            >
              {title !== undefined && (
                <div className={cx("sticky top-0 z-10 flex items-center justify-between gap-4 border-b px-5 py-3", dark ? "border-paper/20 bg-ink" : "border-line bg-paper")}>
                  <h2 id={labelledBy} className="h-title text-2xl">{title}</h2>
                  <button onClick={onClose} className="grid h-11 w-11 place-items-center" aria-label="Close"><X className="h-5 w-5" /></button>
                </div>
              )}
              {children}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
}

/* ---------- Toasts ---------- */

type Toast = { id: number; message: ReactNode; tone: "ink" | "bad" };
const ToastContext = createContext<(message: ReactNode, tone?: Toast["tone"]) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: ReactNode, tone: Toast["tone"] = "ink") => {
    const id = Date.now() + Math.random();
    setToasts(current => [...current.slice(-2), { id, message, tone }]);
    setTimeout(() => setToasts(current => current.filter(t => t.id !== id)), tone === "bad" ? 7000 : 3200);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4" role="status" aria-live="polite">
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div key={toast.id} layout initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}
              className={cx("pointer-events-auto max-w-md px-5 py-3 text-sm", toast.tone === "bad" ? "bg-bad text-paper" : "bg-ink text-paper")}>
              {toast.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

/* ---------- Controls ---------- */

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (value: boolean) => void; label: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
      className="inline-flex min-h-11 items-center gap-2.5 text-left font-bold lowercase tracking-[-0.02em] disabled:opacity-40">
      <span className={cx("relative h-6 w-11 shrink-0 rounded-full border border-ink transition-colors", checked ? "bg-ink" : "bg-paper")}>
        <span className={cx("absolute top-[3px] h-4 w-4 rounded-full transition-all", checked ? "left-[22px] bg-paper" : "left-[3px] bg-ink")} />
      </span>
      <span>{label}</span>
    </button>
  );
}

export function Stepper({ value, onChange, min = 1, max = 20, label }: { value: number; onChange: (value: number) => void; min?: number; max?: number; label: string }) {
  return (
    <div className="inline-flex items-stretch overflow-hidden rounded-[4px] border border-ink" role="group" aria-label={label}>
      <button type="button" className="grid w-10 place-items-center disabled:opacity-30" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Fewer ${label}`}><Minus className="h-4 w-4" /></button>
      <output className="grid min-w-9 place-items-center border-x border-ink px-2 font-bold tabular" aria-live="polite">{value}</output>
      <button type="button" className="grid w-10 place-items-center disabled:opacity-30" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`More ${label}`}><Plus className="h-4 w-4" /></button>
    </div>
  );
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return <span className={cx("inline-block animate-spin rounded-full border-2 border-current border-r-transparent", className)} aria-hidden="true" />;
}

export type NoticeTone = "dark" | "note" | "bad" | "ok";
export function Notice({ tone = "note", children, action, className }: { tone?: NoticeTone; children: ReactNode; action?: ReactNode; className?: string }) {
  const tones: Record<NoticeTone, string> = {
    dark: "border-ink bg-ink text-paper",
    note: "border-ink bg-paper text-ink",
    bad: "border-bad bg-[#fdf3f2] text-bad",
    ok: "border-line bg-wash text-ink",
  };
  return (
    <div className={cx("flex flex-wrap items-center justify-between gap-3 border px-4 py-3 text-sm", tones[tone], className)} role={tone === "bad" ? "alert" : "status"}>
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}

export function Empty({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="grid place-items-center gap-2 px-6 py-14 text-center">
      <h3 className="h-title text-2xl">{title}</h3>
      {children && <div className="max-w-sm text-sm text-mute">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, dark = false }: { label: string; value: ReactNode; hint?: ReactNode; dark?: boolean }) {
  return (
    <div className={cx("border p-5", dark ? "border-ink bg-ink text-paper" : "border-line bg-paper")}>
      <div className={cx("label", dark ? "text-paper/70" : "text-mute")}>{label}</div>
      <div className="mt-2 text-4xl font-bold tracking-[-0.05em] tabular sm:text-[2.6rem]">{value}</div>
      {hint && <div className={cx("mt-1 text-xs", dark ? "text-paper/70" : "text-mute")}>{hint}</div>}
    </div>
  );
}
