"use client";
import { useEffect, useRef, useState } from "react";
import { ApiError, httpAdapters, tokenFromFragment, type PublicAdapter } from "../../lib/client/adapters";
import { usePoll } from "../../lib/client/use-poll";
import { Cup, Freshness, Shell } from "./ui";
import styles from "./styles.module.css";

const STEPS = ["Order received", "Being made", "Ready to collect", "Collected"];
const MESSAGES = {
  queued: ["You're in the queue", "We've received your order. A little goodness is on its way."],
  making: ["Made just for you", "Our baristas are preparing your drinks. We'll let you know when they're ready."],
  ready: ["Your drinks are ready!", "Pop over to the collection counter and show your order number."],
  collected: ["Enjoy every sip", "Your order has been collected. Thank you for sharing a little good."],
  cancelled: ["Order cancelled", "Please speak with the counter team if you need help with this order."],
};
export function GuestScreen({ adapter = httpAdapters }: { adapter?: PublicAdapter }) {
  const [link, setLink] = useState<{ token: string | null; cacheKey?: string; requestKey: string } | null>(null);
  const [sound, setSound] = useState(false);
  const [soundMessage, setSoundMessage] = useState("");
  const audio = useRef<AudioContext | null>(null);
  const alerted = useRef(false);
  const currentToken = useRef<string | null>(null);
  useEffect(() => {
    let version = 0;
    async function readLink() {
      const request = ++version;
      const token = tokenFromFragment(window.location.hash);
      if (currentToken.current !== token) { alerted.current = false; currentToken.current = token; }
      if (token && window.crypto?.subtle) {
        const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
        if (request === version) setLink({ token, requestKey: String(request), cacheKey: `bb-guest-v1:${Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("")}` });
      } else setLink({ token, requestKey: String(request) });
    }
    void readLink(); window.addEventListener("hashchange", readLink);
    return () => { version++; window.removeEventListener("hashchange", readLink); void audio.current?.close(); };
  }, []);
  const poll = usePoll(signal => adapter.guest(link!.token!, signal), { enabled: !!link?.token, cacheKey: link?.cacheKey, requestKey: link?.requestKey });
  const status = poll.data?.order.status;
  function chime() {
    const context = audio.current;
    if (!context || context.state !== "running") { setSoundMessage("Sound is paused by your browser. Keep this page open and check the status."); return; }
    try {
      for (const [index, frequency] of [660, 880, 1046].entries()) {
        const oscillator = context.createOscillator(); const gain = context.createGain();
        oscillator.connect(gain); gain.connect(context.destination); oscillator.frequency.value = frequency;
        const start = context.currentTime + index * .18;
        gain.gain.setValueAtTime(.0001, start); gain.gain.exponentialRampToValueAtTime(.13, start + .015); gain.gain.exponentialRampToValueAtTime(.0001, start + .4);
        oscillator.start(start); oscillator.stop(start + .42);
      }
    } catch { setSoundMessage("Sound couldn't play. The ready message will stay visible here."); }
  }
  async function enableSound() {
    const Constructor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Constructor) { setSoundMessage("This browser doesn't support sound alerts. Watch this page for the ready message."); return; }
    try {
      audio.current ??= new Constructor();
      await audio.current.resume();
      if (audio.current.state !== "running") throw new Error("Suspended audio");
      setSound(true); setSoundMessage("Sound enabled. Keep this page open and your device unmuted.");
      chime();
    } catch { setSoundMessage("Your browser blocked sound. You can try again or watch the on-screen status."); }
  }
  useEffect(() => {
    if (status !== "ready" || alerted.current || poll.offline || poll.error || poll.loading) return;
    alerted.current = true;
    if (sound) chime();
    try { navigator.vibrate?.([180, 100, 180]); } catch { /* Vibration is optional and browser-dependent. */ }
  }, [status, sound, poll.offline, poll.error, poll.loading]);
  const invalid = poll.error instanceof ApiError && [401, 403, 404, 410].includes(poll.error.status);
  const order = poll.data?.order;
  const step = ["queued", "making", "ready", "collected"].indexOf(status ?? "");
  return <Shell><div className={styles.guest}>
    {!link || (link.token && poll.loading && !order) ? <div className={styles.empty} role="status"><Cup size={45}/><h1>Finding your order…</h1><p>Just a moment while we check with the counter.</p></div>
    : !link.token ? <div className={styles.empty}><span className={styles.eyebrow}>YOUR COFFEE, A LITTLE CLOSER</span><h1>Good things are brewing.</h1><p>Place your order at the counter, then scan the QR on your order ticket to follow your drinks here.</p><Cup size={52}/><p className={styles.finePrint}>Already ordered? Ask the counter team for your personal order QR. Your first name appears on the booth ready board until collection.</p></div>
    : invalid ? <div className={styles.empty}><span className={styles.eyebrow}>LET'S FIND YOUR COFFEE</span><h1>This link isn't available.</h1><p>It may be invalid or expired. Ask the counter team to check your order and show you its QR again.</p><button className={styles.button} onClick={poll.retry}>Check again</button></div>
    : !order ? <div className={styles.empty} role="status"><h1>Can't reach the counter.</h1><p>{poll.offline ? "You're offline. Reconnect to load your order for the first time." : "Your order may still be syncing from the tablet. Please try again in a moment or ask the team."}</p><button className={styles.button} onClick={poll.retry}>Try again</button></div>
    : <><div className={styles.guestIntro}><span className={styles.eyebrow}>A LITTLE COFFEE. A LOT OF GOOD.</span><h1>{MESSAGES[order.status][0]}</h1><p>{MESSAGES[order.status][1]}</p></div>
    <article className={styles.ticket}><div className={`${styles.ticketTop} ${status === "ready" ? styles.readyTicket : ""}`} role={status === "ready" ? "alert" : "status"}><span className={styles.eyebrow}>YOUR ORDER NUMBER</span><strong className={styles.number}>{order.publicNumber}</strong><span className={styles.statusLabel}><Cup size={16}/>{status === "ready" ? "Ready for collection" : status === "making" ? "Barista at work" : status === "collected" ? "Collected with thanks" : status === "cancelled" ? "Cancelled" : "In the queue"}</span></div>
    <div className={styles.ticketBody}>{status !== "cancelled" && <ol className={styles.steps} aria-label="Order progress">{STEPS.map((label, index) => <li key={label} data-complete={index <= step} aria-current={index === step ? "step" : undefined}>{label}</li>)}</ol>}
    <div className={styles.summaryTitle}><h2>Your little pick-me-up</h2><span>{order.items.reduce((sum, item) => sum + item.quantity, 0)} cups</span></div>{order.items.map((item, index) => <div className={styles.drinkLine} key={index}><div><strong>{item.nameSnapshot}</strong><small>{item.milk} · {item.temperature}</small></div><span className={styles.qty}>×{item.quantity}</span></div>)}</div></article>
    {!["collected", "cancelled"].includes(status!) && <div className={styles.alertBox}><strong>We'll give you a little nudge.</strong><p>Enable an optional sound when your drinks are ready.</p><button type="button" className={`${styles.button} ${styles.secondary}`} onClick={() => { if (sound) { setSound(false); setSoundMessage("Sound off. The ready message will still appear here."); } else void enableSound(); }}>{sound ? "Turn sound off" : "Enable sound alert"}</button><p role="status">{soundMessage}</p><p className={styles.finePrint}>Keep this page open. Sound, vibration and updates may pause when your phone is muted, locked or in the background. No SMS or push notifications are sent.</p></div>}
    <div className={styles.guestFreshness}><Freshness offline={poll.offline} error={poll.error} loading={poll.loading} syncedAt={poll.data?.syncedAt} onRetry={poll.retry}/></div>
    {(poll.offline || poll.error) && <p className={styles.finePrint}>This is the last status we received. New updates need a connection from both your phone and the booth tablet. Ask at the counter if you're unsure.</p>}
    <p className={styles.finePrint}>Every cup supports Singapore Red Cross Young Hearts. Payments are handled at the organiser's POS.</p></>}
  </div></Shell>;
}
