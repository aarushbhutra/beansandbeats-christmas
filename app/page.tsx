/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { Logo, Wordmark } from "@/components/brand/brand";

const STEPS = [
  { title: "order at the counter", body: "Tell our barista what you'd like. They key it into the tablet and you pay at the organiser's POS with PayNow or card." },
  { title: "scan to follow", body: "Scan the QR code on the counter screen. Your order opens on your phone: no app, no sign-up." },
  { title: "collect when it's ready", body: "Your phone buzzes and your name appears on the board. Show your pickup code at the counter." },
];

const STAFF = [
  { href: "/orders", title: "orders", body: "take an order on the counter tablet" },
  { href: "/barista", title: "queue", body: "make, mark ready, scan pickups" },
  { href: "/ready", title: "ready board", body: "the screen at the booth" },
  { href: "/lead", title: "lead", body: "menu, sales, tablets and team" },
];

export default function Home() {
  return (
    <div className="min-h-svh bg-paper">
      <header className="sticky top-0 z-40 border-b border-line bg-paper">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" aria-label="beans&beats home"><Wordmark /></Link>
          <nav className="flex items-center gap-4 sm:gap-6" aria-label="Main">
            <Link href="/" aria-current="page" className="nav-link hidden sm:inline-flex">home</Link>
            <Link href="/guest" className="nav-link">track my order</Link>
            <Link href="/ready" className="nav-link hidden sm:inline-flex">ready board</Link>
            <Link href="/login" className="nav-link">staff</Link>
          </nav>
        </div>
      </header>

      <section className="relative h-[calc(100svh-4rem)] min-h-[460px] overflow-hidden">
        <img src="/brand/hero.jpg" alt="A crowd dancing at a beans&beats coffee party" className="absolute inset-0 h-full w-full object-cover" />
        <div className="relative mx-auto flex h-full max-w-[1400px] items-center px-4 sm:px-6">
          <div className="max-w-[min(100%,34rem)]">
            <h1 className="text-[2.25rem] font-bold leading-[1.02] tracking-[-0.05em] text-paper drop-shadow-[0_1px_12px_rgba(0,0,0,.25)] sm:text-[2.6rem]">
              the beans&amp;beats charity café at christmas together.
            </h1>
            <p className="mt-4 text-lg font-bold leading-snug tracking-[-0.03em] text-paper drop-shadow-[0_1px_10px_rgba(0,0,0,.3)]">specialty coffee and curated music, 26–29 november 2026.</p>
            <Link href="/guest" className="btn btn-outline mt-6">track my order</Link>
          </div>
        </div>
      </section>

      <div className="bar">how it works</div>
      <section className="mx-auto grid max-w-[1400px] gap-px bg-line sm:grid-cols-3">
        {STEPS.map((step, index) => (
          <div key={step.title} className="bg-paper px-6 py-10">
            <div className="text-sm text-mute">{index + 1}</div>
            <h2 className="h-title mt-2 text-[1.6rem]">{step.title}</h2>
            <p className="mt-3 max-w-sm text-[0.95rem] leading-relaxed text-mute">{step.body}</p>
          </div>
        ))}
      </section>

      <div className="bar">for the team</div>
      <section className="grid lg:grid-cols-2">
        <div className="relative min-h-[300px]">
          <img src="/brand/party.jpg" alt="A DJ playing at a beans&beats event" className="absolute inset-0 h-full w-full object-cover" />
        </div>
        <ul className="divide-y divide-line">
          {STAFF.map(item => (
            <li key={item.href}>
              <Link href={item.href} className="group flex items-baseline justify-between gap-4 px-6 py-7 hover:bg-wash">
                <span className="h-title text-[1.6rem] group-hover:underline group-hover:underline-offset-4">{item.title}</span>
                <span className="text-right text-sm text-mute">{item.body}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <footer className="bg-ink text-paper">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-start gap-10 px-6 py-10">
          <div className="grid justify-items-center gap-2">
            <Logo height={56} light />
            <span className="text-sm">beans&amp;beats</span>
          </div>
          <div className="grid gap-1 text-sm">
            <span>a charity café at christmas together, singapore.</span>
            <span className="text-paper/80">Payments are taken on the organiser&apos;s POS. We collect first names only, and delete them after pickup.</span>
            <a className="mt-2 w-fit hover:underline" href="https://beansnbeats.com" target="_blank" rel="noreferrer">beansnbeats.com</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
