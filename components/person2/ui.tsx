import type { ReactNode } from "react";
import { sgtTime } from "../../lib/client/format";
import styles from "./styles.module.css";

export function Cup({ size = 28 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M7 12h17v9a7 7 0 0 1-7 7h-3a7 7 0 0 1-7-7v-9Z" stroke="currentColor" strokeWidth="1.7"/><path d="M24 14h2a4 4 0 0 1 0 8h-2M12 3v5m5-6v6m5-5v5M5 29h22" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>;
}
export function Brand({ light = false }: { light?: boolean }) {
  return <span className={`${styles.brand} ${light ? styles.light : ""}`}><Cup /><span>beans<span className={styles.amp}>&</span>beats<small>CHRISTMAS TOGETHER · 2026</small></span></span>;
}
export function Shell({ children, section, wide = false }: { children: ReactNode; section?: "menu" | "reports"; wide?: boolean }) {
  return <main className={`${styles.root} ${wide ? styles.wide : ""}`}><header className={styles.header}><a href={section ? "/lead/menu" : "/guest"} aria-label="Beans and Beats home"><Brand /></a><span className={styles.event}>A little coffee.<br/>A lot of good.</span></header>{section && <nav className={styles.nav} aria-label="Booth lead"><a href="/lead/menu" aria-current={section === "menu" ? "page" : undefined}>Menu controls</a><a href="/lead/reports" aria-current={section === "reports" ? "page" : undefined}>Daily reports</a><a href="/ready">Open ready board ↗</a><span>BOOTH LEAD</span></nav>}<div className={styles.content}>{children}</div><footer className={styles.footer}><span>Made with care. Shared for good.</span><span>Supporting Singapore Red Cross Young Hearts</span></footer></main>;
}
export function Freshness({ offline, error, loading, syncedAt, onRetry }: { offline: boolean; error?: Error | null; loading?: boolean; syncedAt?: string | null; onRetry?: () => void }) {
  const stale = offline || !!error;
  return <div className={`${styles.freshness} ${stale ? styles.stale : ""}`} role="status"><span className={styles.dot}/><span>{offline ? "Offline · showing last synced data" : error ? "Updates paused · data may be out of date" : loading ? "Connecting…" : "Live updates"}{syncedAt && <> · last synced {sgtTime(syncedAt)} SGT</>}</span>{stale && onRetry && <button type="button" onClick={onRetry}>Retry</button>}</div>;
}
export function StaffGate({ configured, loading, role }: { configured: boolean; loading?: boolean; role?: string | null }) {
  return <div className={styles.empty}><span className={styles.eyebrow}>STAFF ACCESS</span><h1>{loading ? "Checking your access…" : !configured ? "Staff connection needed" : "Booth leads only"}</h1><p>{!configured ? "Connect the shared staff session and sync provider to use this screen." : loading ? "Please wait while your session is checked." : "Sign in with a booth-lead account to manage the menu and daily reports."}</p><a className={styles.button} href="/login">Staff sign in</a></div>;
}
