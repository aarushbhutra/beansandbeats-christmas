"use client";
import { httpAdapters, type PublicAdapter } from "../../lib/client/adapters";
import { usePoll } from "../../lib/client/use-poll";
import { Brand, Cup, Freshness } from "./ui";
import styles from "./styles.module.css";

export function ReadyScreen({ adapter = httpAdapters }: { adapter?: PublicAdapter }) {
  // Cache only numbers for a warm reload. First names stay in memory only.
  const poll = usePoll(signal => adapter.ready(signal), { interval: 3000, cacheKey: "bb-ready-numbers-v1", toCache: data => ({ ...data, orders: data.orders.map(order => ({ ...order, firstName: "" })) }) });
  const orders = poll.data?.orders ?? [];
  return <main className={`${styles.root} ${styles.board}`}><header className={styles.header}><Brand light/><span className={styles.event}>Coffee for a cause.<br/>Christmas Together 2026</span></header><div className={styles.content}><div className={styles.boardHeading}><div><span className={styles.eyebrow}>FRESHLY MADE. READY FOR YOU.</span><h1>Good things are ready.</h1><p>Find your number. Collect a little joy.</p></div><span className={styles.count}>{orders.length} {orders.length === 1 ? "order" : "orders"} awaiting collection</span></div>
    <Freshness offline={poll.offline} error={poll.error} loading={poll.loading} syncedAt={poll.data?.syncedAt} onRetry={poll.retry}/>
    {(poll.offline || poll.error) && <div className={styles.notice} role="alert">The board is showing its last known orders. Names are hidden until updates resume. Please check with the counter team.</div>}
    <div className={styles.sectionHeading}><span className={styles.boardLabel}>ORDER NUMBER / FIRST NAME</span><span>COLLECT AT THE COUNTER</span></div>
    {orders.length ? <div className={styles.boardGrid} style={{ marginTop: 20 }} aria-label="Orders ready for collection">{orders.map(order => <article className={styles.boardCard} key={order.publicNumber}><strong>{order.publicNumber}</strong><p>{poll.offline || poll.error ? "Check at counter" : order.firstName}</p></article>)}</div>
    : <div className={styles.boardEmpty} style={{ marginTop: 20 }} role="status"><Cup size={54}/><h2>{poll.loading ? "Checking the counter…" : poll.error || poll.offline ? "Waiting for a connection" : "A little goodness is brewing."}</h2><p>{poll.loading ? "Ready orders will appear here." : poll.error || poll.offline ? "Please ask the team about your order." : "Your number will appear here when your drinks are ready."}</p></div>}
    </div><footer className={styles.footer}><span>Thank you for sharing a little good.</span><span>Supporting Singapore Red Cross Young Hearts</span></footer></main>;
}
