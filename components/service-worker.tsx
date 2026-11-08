"use client";
import { useEffect } from "react";

/** Registers the offline shell worker in production builds; removes stale workers in dev. */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations().then(list => list.forEach(r => void r.unregister()));
      return;
    }
    const register = () => navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then(registration => {
      (window as Window & { __bbSw?: ServiceWorkerRegistration }).__bbSw = registration;
      window.dispatchEvent(new Event("bb-sw"));
    }).catch(() => {});
    if (document.readyState === "complete") void register();
    else window.addEventListener("load", () => void register(), { once: true });
  }, []);
  return null;
}
