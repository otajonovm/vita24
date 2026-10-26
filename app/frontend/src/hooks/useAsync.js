import { useCallback, useEffect, useRef, useState } from "react";
import { isCanceled } from "../lib/requestGate";

export function useAsync(fetcher, deps = [], { enabled = true, keepPreviousData = true } = {}) {
  const [data, setData] = useState(undefined);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [isRefetching, setIsRefetching] = useState(false);
  const abortRef = useRef(null);
  const requestIdRef = useRef(0);
  const hasDataRef = useRef(false);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const reload = useCallback(async () => {
    if (!enabled) return undefined;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestIdRef.current;
    const keep = keepPreviousData && hasDataRef.current;
    setError(null);
    if (keep) setIsRefetching(true);
    else {
      setLoading(true);
      if (!keepPreviousData) {
        hasDataRef.current = false;
        setData(undefined);
      }
    }
    try {
      const result = await fetcherRef.current({ signal: controller.signal });
      if (requestId !== requestIdRef.current) return result;
      hasDataRef.current = true;
      setData(result);
      setError(null);
      return result;
    } catch (err) {
      if (isCanceled(err) || requestId !== requestIdRef.current) return undefined;
      setError(err);
      return undefined;
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setIsRefetching(false);
      }
    }
  }, [enabled, keepPreviousData, ...deps]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setIsRefetching(false);
      return undefined;
    }
    reload();
    return () => {
      abortRef.current?.abort();
    };
  }, [reload, enabled]);

  return { data, loading, error, reload, isRefetching, setData };
}

export default useAsync;
