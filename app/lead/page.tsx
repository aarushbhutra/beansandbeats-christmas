"use client";
import Link from "next/link";
import { ArrowRight, Download, Monitor, TriangleAlert } from "lucide-react";
import { cx, Notice, Stat } from "@/components/ui/ui";
import { useNow } from "@/lib/client/hooks";
import { useApi } from "@/lib/client/use-api";
import { formatDayLabel, formatMoney } from "@/lib/domain/rules";
import type { Device } from "@/lib/domain/types";

type Overview = {
  day: string; storage: string; serverTime: string;
  stats: Record<string, number>;
  devices: (Device & { orders: number; lastOrderAt: string | null })[];
  issues: { id: string; prefix: string; publicNumber: string | null; code: string; message: string; createdAt: string }[];
};

export default function LeadHome() {
  const { data, error } = useApi<Overview>("/api/lead/overview");
  const now = useNow(10_000);
  const s = data?.stats;
  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-mute">{data ? formatDayLabel(data.day) : "today"} · live</p>
          <h1 className="h-display mt-1 text-[2.6rem]">today</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/ready" target="_blank" rel="noreferrer" className="btn btn-outline"><Monitor className="h-4 w-4" /> open board</a>
          {data && <a href={`/api/lead/reports.csv?day=${data.day}`} className="btn btn-solid"><Download className="h-4 w-4" /> today&apos;s csv</a>}
        </div>
      </div>

      {data?.storage === "ephemeral" && <Notice tone="bad"><b>demo storage.</b> No DATABASE_URL is set, so data lives in temporary server memory and can reset at any time. Connect Postgres before service.</Notice>}
      {data?.storage === "local" && <Notice tone="ok"><b>local database.</b> Running on the embedded PGlite store in <code>.data/</code>. Use Postgres for a deployed booth.</Notice>}
      {error && <Notice tone="note">{error.status === 0 ? "Offline: lead dashboards need a connection. Orders and the bar keep working." : error.message}</Notice>}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat dark label="cups today" value={s ? s.cups : "—"} hint={s ? `${s.orders} orders · ${s.cancelled} cancelled` : undefined} />
        <Stat label="recorded value" value={s ? formatMoney(s.total_cents) : "—"} hint="booth records, not POS payments" />
        <Stat label="in flight" value={s ? s.queued + s.making : "—"} hint={s ? `${s.queued} queued · ${s.making} making` : undefined} />
        <Stat label="waiting at counter" value={s ? s.ready : "—"} hint={s ? `${s.last15} orders in the last 15 min` : undefined} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="h-title text-3xl">tablets</h2>
            <Link href="/lead/devices" className="underline-offset-4 hover:underline text-sm font-semibold">manage →</Link>
          </div>
          <ul className="mt-3 grid gap-2">
            {(data?.devices ?? []).filter(d => !d.revokedAt).map(device => {
              const seen = device.lastSeenAt ? Math.round((now - Date.parse(device.lastSeenAt)) / 60000) : null;
              const healthy = device.pendingOps === 0 && seen !== null && seen < 5;
              return (
                <li key={device.id} className="flex items-center gap-4 border border-line p-4">
                  <span className="grid h-12 w-12 place-items-center bg-ink text-xl font-bold text-paper">{device.prefix}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold tracking-[-0.03em]">{device.label}</div>
                    <div className="text-xs text-mute">{device.orders} orders · seen {seen === null ? "never" : seen < 1 ? "just now" : `${seen} min ago`}</div>
                  </div>
                  <span className={cx("tag", healthy ? "text-ink" : device.gapExpected ? "text-bad" : "text-ink")}>
                    {device.gapExpected ? "sync gap" : device.pendingOps ? `${device.pendingOps} unsynced` : healthy ? "in sync" : "not reporting"}
                  </span>
                </li>
              );
            })}
            {data && !data.devices.some(d => !d.revokedAt) && <li className="border border-dashed border-line p-6 text-center text-sm text-mute">no tablets yet. <Link className="underline-offset-4 hover:underline font-semibold text-ink" href="/lead/devices">register this one →</Link></li>}
          </ul>
        </section>
        <section>
          <h2 className="h-title text-3xl">needs a look</h2>
          <ul className="mt-3 grid gap-2">
            {(data?.issues ?? []).slice(0, 5).map(issue => (
              <li key={issue.id} className="border border-bad/40 p-3 text-sm">
                <div className="flex items-center gap-2 text-xs text-bad"><TriangleAlert className="h-3.5 w-3.5" /> tablet {issue.prefix} · {issue.publicNumber ?? issue.code.toLowerCase()}</div>
                <p className="mt-1">{issue.message}</p>
              </li>
            ))}
            {data && !data.issues.length && <li className="border border-line p-6 text-center text-sm text-mute">all clear. no sync conflicts.</li>}
          </ul>
        </section>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          { href: "/lead/menu", title: "sold out?", body: "mark items sold out or change prices. old orders keep their prices." },
          { href: "/lead/reports", title: "close the day", body: "reconcile tablets, export the csv and lock the day's numbers." },
          { href: "/lead/team", title: "add a barista", body: "create accounts, reset passwords, revoke access." },
        ].map(card => (
          <Link key={card.href} href={card.href} className="group border border-ink p-5 transition-colors hover:bg-ink hover:text-paper">
            <div className="flex items-center justify-between"><h3 className="h-title text-2xl">{card.title}</h3><ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1 group-hover:text-ink" /></div>
            <p className="mt-2 text-sm opacity-70">{card.body}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
