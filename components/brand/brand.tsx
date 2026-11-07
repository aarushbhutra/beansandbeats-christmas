/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from "react";

/** The beans&beats hand-drawn b&b mark (their own logo files). */
export function Logo({ height = 34, light = false, className = "" }: { height?: number; light?: boolean; className?: string }) {
  return <img src={light ? "/brand/logo-white.png" : "/brand/logo-black.png"} alt="" width={Math.round(height * 1.456)} height={height} className={className} style={{ height, width: "auto" }} />;
}

/** Header lockup exactly like the site: mark + "beans&beats" in regular weight. */
export function Wordmark({ light = false, size = "md" }: { light?: boolean; size?: "sm" | "md" | "lg" }) {
  const h = size === "sm" ? 28 : size === "lg" ? 46 : 34;
  return (
    <span className="inline-flex items-center gap-2.5">
      <Logo height={h} light={light} />
      <span className={size === "lg" ? "text-2xl tracking-[-0.04em]" : "text-lg tracking-[-0.04em]"}>beans&amp;beats</span>
    </span>
  );
}

/** "b&b × christmas together" co-brand line from the organiser's brief. */
export function CoBrand({ light = false }: { light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-3">
      <Logo height={30} light={light} />
      <span className={light ? "text-paper/60" : "text-mute"}>×</span>
      <span className="text-[0.95rem] font-bold uppercase leading-[0.95] tracking-[-0.02em]">christmas<br />together</span>
    </span>
  );
}

/** The site's black full-width section bar with a centred lowercase title. */
export function Bar({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`bar ${className}`}>{children}</div>;
}
