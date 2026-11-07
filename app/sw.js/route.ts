/**
 * Offline app-shell service worker, generated per build (each deploy gets a new version, so tablets
 * pick up updates). It caches page shells and the static assets those shells reference, never API
 * responses, personal data, tracking tokens or authenticated requests.
 */
export const dynamic = "force-static";

const VERSION = `${process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? ""}-${Date.now().toString(36)}`;
const PAGES = ["/", "/orders", "/barista", "/ready", "/guest", "/login", "/lead", "/lead/menu", "/lead/reports", "/lead/devices", "/lead/team"];

function worker(version: string): string {
  return `/* beans&beats offline shell · ${version} */
const CACHE = "bb-shell-${version}";
const PAGES = ${JSON.stringify(PAGES)};
const FALLBACK = "/offline.html";
const STATIC = /^\\/_next\\/static\\//;

async function cacheShell(cache, path) {
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) return [];
  const html = await response.clone().text();
  await cache.put(path, response);
  // Collect every same-origin static asset the shell references (scripts, CSS, preloaded fonts).
  return [...html.matchAll(/(?:src|href)="(\\/_next\\/static\\/[^"]+)"/g)].map(m => m[1].replace(/&amp;/g, "&"));
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll([FALLBACK, "/manifest.webmanifest", "/icon-192.png", "/brand/logo-black.png", "/brand/logo-white.png"]).catch(() => {});
    const assets = new Set();
    for (const path of PAGES) {
      try { (await cacheShell(cache, path)).forEach(a => assets.add(a)); } catch {}
    }
    await Promise.allSettled([...assets].map(async url => { if (!(await cache.match(url))) await cache.add(url); }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith("bb-shell-") && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || request.headers.has("authorization")) return;
  // React Server Component payloads: network only. Offline, Next falls back to a full navigation, served below.
  if (request.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) return;

  if (STATIC.test(url.pathname)) {
    event.respondWith(caches.match(request).then(hit => hit || fetch(request).then(response => {
      if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(request, copy)); }
      return response;
    })));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const key = url.pathname.replace(/\\/$/, "") || "/";
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        const response = await fetch(request, { signal: controller.signal });
        clearTimeout(timer);
        if (response.ok && PAGES.includes(key)) cache.put(key, response.clone());
        return response;
      } catch {
        return (await cache.match(key)) || (await cache.match(FALLBACK)) || Response.error();
      }
    })());
    return;
  }

  // Images, icons, manifest: stale-while-revalidate.
  event.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(request);
    const network = fetch(request).then(response => { if (response.ok) cache.put(request, response.clone()); return response; }).catch(() => hit);
    return hit || network;
  }));
});
`;
}

export function GET() {
  return new Response(worker(VERSION), {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Service-Worker-Allowed": "/",
    },
  });
}
