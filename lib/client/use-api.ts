"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";
import { useEngine } from "./hooks";

/** Online-only lead data. Refetches whenever the sync engine completes a cycle (driven by live events). */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const engine = useEngine();
  const latest = useRef(path);
  latest.current = path;
  const load = useCallback(async () => {
    if (!path) return;
    try {
      const result = await api<T>(path);
      if (latest.current === path) { setData(result); setError(null); }
    } catch (cause) {
      if (latest.current === path) setError(cause instanceof ApiError ? cause : new ApiError(0, "NETWORK", "Unavailable"));
    } finally {
      if (latest.current === path) setLoading(false);
    }
  }, [path]);
  useEffect(() => { setLoading(true); void load(); }, [load]);
  useEffect(() => { if (engine.lastSyncAt) void load(); }, [engine.lastSyncAt, load]);
  return { data, error, loading, reload: load, setData };
}
