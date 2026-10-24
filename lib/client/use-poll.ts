"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "./adapters";

interface PollState<T> { data: T | null; loading: boolean; error: Error | null; offline: boolean; lastSuccess: string | null }
/** A single request at a time, abort on unmount, immediate foreground/reconnect refresh. */
export function usePoll<T>(read: (signal: AbortSignal) => Promise<T>, options: { interval?: number; cacheKey?: string; enabled?: boolean; requestKey?: string; toCache?: (data: T) => T } = {}) {
  const { interval = 5000, cacheKey, enabled = true, requestKey } = options;
  const [state, setState] = useState<PollState<T>>({ data: null, loading: true, error: null, offline: false, lastSuccess: null });
  const [refresh, setRefresh] = useState(0);
  const latest = useRef(read);
  const cacheTransform = useRef(options.toCache);
  latest.current = read;
  cacheTransform.current = options.toCache;
  useEffect(() => {
    if (!enabled) { setState({ data: null, loading: false, error: null, offline: false, lastSuccess: null }); return; }
    let stopped = false;
    let controller: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout>;
    setState({ data: null, loading: true, error: null, offline: !navigator.onLine, lastSuccess: null });
    if (cacheKey) {
      try {
        const cached = JSON.parse(sessionStorage.getItem(cacheKey) ?? "null");
        if (cached?.data && cached?.lastSuccess) setState({ ...cached, loading: true, offline: !navigator.onLine, error: new ApiError("CACHED_SNAPSHOT", "Showing a saved snapshot while reconnecting.") });
      } catch { /* Cache is optional; storage denial must not block live reads. */ }
    }
    async function poll() {
      if (stopped || controller) return;
      clearTimeout(timer);
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 12000);
      try {
        const data = await latest.current(controller.signal);
        if (stopped) return;
        const lastSuccess = new Date().toISOString();
        const stamp = data as { syncedAt?: string; generatedAt?: string };
        const snapshotAt = stamp?.syncedAt ?? stamp?.generatedAt;
        const timestamp = snapshotAt ? Date.parse(snapshotAt) : NaN;
        const stale = !Number.isFinite(timestamp) || Date.now() - timestamp > 30000 || timestamp - Date.now() > 5000;
        const error = stale ? new ApiError("STALE_SNAPSHOT", "The service returned an old or undated snapshot.") : null;
        setState({ data, loading: false, error, offline: false, lastSuccess });
        if (cacheKey) try { sessionStorage.setItem(cacheKey, JSON.stringify({ data: cacheTransform.current?.(data) ?? data, lastSuccess })); } catch { /* optional */ }
      } catch (cause) {
        if (stopped) return;
        const error = cause instanceof Error ? cause : new Error("Unable to refresh.");
        const invalid = error instanceof ApiError && [401, 403, 404, 410].includes(error.status);
        if (invalid && cacheKey) try { sessionStorage.removeItem(cacheKey); } catch { /* optional */ }
        setState(previous => ({ ...previous, data: invalid ? null : previous.data, loading: false, error, offline: !navigator.onLine }));
      } finally {
        clearTimeout(timeout);
        controller = null;
        if (!stopped) timer = setTimeout(poll, interval);
      }
    }
    const wake = () => { if (document.visibilityState !== "hidden") void poll(); };
    const offline = () => setState(previous => ({ ...previous, offline: true }));
    void poll();
    window.addEventListener("online", wake);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", wake);
    return () => { stopped = true; clearTimeout(timer); controller?.abort(); window.removeEventListener("online", wake); window.removeEventListener("offline", offline); document.removeEventListener("visibilitychange", wake); };
  }, [interval, cacheKey, enabled, requestKey, refresh]);
  return { ...state, retry: useCallback(() => setRefresh(n => n + 1), []) };
}
