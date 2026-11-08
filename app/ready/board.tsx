"use client";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CoBrand } from "@/components/brand/brand";
import { cx } from "@/components/ui/ui";
import { api, subscribe } from "@/lib/client/api";
import { formatSgtTime } from "@/lib/domain/rules";
import type { BoardResponse } from "@/lib/domain/types";

const CACHE = "bb-board-v3";

/** Booth screen. Layout follows the organiser's mockup: "Ready" names and numbers, then "Making" in grey. */
export function Board() {
  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [live, setLive] = useState<"open" | "retrying" | "closed">("closed");
  const [lastOk, setLastOk] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const seen = useRef<Set<string> | null>(null);

  const accept = useCallback((next: BoardResponse) => {
    const ids = new Set(next.ready.map(r => r.publicNumber));
    if (seen.current) {
      const arrivals = [...ids].filter(id => !seen.current!.has(id));
      if (arrivals.length) {
        setFresh(current => new Set([...current, ...arrivals]));
        setTimeout(() => setFresh(current => { const copy = new Set(current); arrivals.forEach(a => copy.delete(a)); return copy; }), 8000);
      }
    }
    seen.current = ids;
    setBoard(next);
    setLastOk(Date.now());
    // Only numbers are cached for a warm reload; names stay in memory.
    try { sessionStorage.setItem(CACHE, JSON.stringify({ ...next, ready: next.ready.map(r => ({ ...r, firstName: null })), making: next.making.map(m => ({ ...m, firstName: null })) })); } catch { /* optional */ }
  }, []);

  useEffect(() => {
    try { const cached = JSON.parse(sessionStorage.getItem(CACHE) ?? "null"); if (cached) setBoard(cached); } catch { /* ignore */ }
    const load = () => api<BoardResponse>("/api/board").then(accept).catch(() => {});
    void load();
    const stop = subscribe("/api/board/live", { onEvent: (event, data) => { if (event === "board") accept(data as BoardResponse); }, onState: setLive });
    const poll = setInterval(load, 15_000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    window.addEventListener("online", load);
    return () => { stop(); clearInterval(poll); clearInterval(tick); window.removeEventListener("online", load); };
  }, [accept]);

  const stale = !lastOk || now - lastOk > 35_000;
  const ready = board?.ready ?? [];
  const making = board?.making ?? [];
  const twoCol = ready.length > 7;

  return (
    <div className="flex h-svh flex-col bg-ink px-[4vw] py-[3.5vh] text-paper">
      <header className="flex items-center justify-between">
        <CoBrand light />
        <div className="flex items-center gap-6 text-[1.1vw]">
          {stale && <span className="text-paper/70">reconnecting · please check with the counter</span>}
          <span className="tabular text-paper/70">{formatSgtTime(new Date(now))}</span>
        </div>
      </header>

      <main className="mt-[4vh] grid min-h-0 flex-1 grid-cols-[1.6fr_1fr] gap-[5vw]">
        <section className="min-h-0">
          <h1 className="text-[1.6vw] text-paper/70">Ready</h1>
          <ul className={cx("mt-[2vh] grid content-start gap-x-[4vw] gap-y-[1.4vh]", twoCol && "grid-cols-2")}>
            <AnimatePresence initial={false}>
              {ready.slice(0, 16).map(entry => (
                <motion.li key={entry.publicNumber} layout initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}
                  className="flex items-baseline gap-[2vw]">
                  <span className={cx("font-bold tracking-[-0.05em] tabular", twoCol ? "w-[11vw] text-[3.2vw]" : "w-[15vw] text-[4.6vw]", fresh.has(entry.publicNumber) && "pulse")}>{entry.shortNumber}</span>
                  <span className={cx("truncate", twoCol ? "text-[2.3vw]" : "text-[3.2vw]")}>{stale ? "" : entry.firstName ?? ""}</span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          {!ready.length && <p className="mt-[3vh] text-[2.4vw] text-paper/50">Nothing waiting yet. Your name shows here when your drink is ready.</p>}
        </section>

        <section className="min-h-0 border-l border-paper/20 pl-[4vw]">
          <h2 className="text-[1.6vw] text-paper/70">Making</h2>
          <ul className="mt-[2vh] grid content-start gap-y-[1.2vh]">
            <AnimatePresence initial={false}>
              {making.slice(0, 12).map(entry => (
                <motion.li key={entry.shortNumber} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-baseline gap-[2vw] text-paper/45">
                  <span className="w-[10vw] text-[2.8vw] font-bold tracking-[-0.05em] tabular">{entry.shortNumber}</span>
                  <span className="truncate text-[2vw]">{stale ? "" : entry.firstName ?? ""}</span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          {!making.length && <p className="mt-[3vh] text-[1.6vw] text-paper/40">—</p>}
          {Boolean(board?.queued) && <p className="mt-[4vh] text-[1.4vw] text-paper/50">{board!.queued} more in the queue</p>}
        </section>
      </main>

      <footer className="flex items-end justify-between border-t border-paper/20 pt-[2vh] text-[1.05vw] text-paper/60">
        <span>Show your pickup code at the counter. Scan the counter QR to follow your order.</span>
        <span className="inline-flex items-center gap-2"><span className={cx("dot", live === "open" && !stale ? "text-paper/70" : "text-paper/30")} /> beans&amp;beats café</span>
      </footer>
    </div>
  );
}
