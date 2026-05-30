import { useCallback, useEffect, useState } from "react";
import { ApiError } from "./api";

export interface AsyncState<T> {
  data?: T;
  loading: boolean;
  error?: string;
  reload: () => void;
}

/** Run an async loader, re-running whenever `deps` change. */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [tick, setTick] = useState(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(loader, deps);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(undefined);
    run()
      .then((d) => live && setData(d))
      .catch((e) => live && setError(errMsg(e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [run, tick]);

  return { data, loading, error, reload: () => setTick((t) => t + 1) };
}

export function errMsg(e: unknown): string {
  if (e instanceof ApiError) return `${e.code}: ${e.message}`;
  if (e instanceof Error) return e.message;
  return String(e);
}

export function Spinner({ label = "loading…" }: { label?: string }) {
  return <div className="muted pad">{label}</div>;
}

export function ErrorBanner({ msg }: { msg: string }) {
  const cf = /CLOUDFLARE/i.test(msg);
  return (
    <div className={cf ? "banner warn" : "banner err"}>
      {cf ? "☁ " : "⚠ "}
      {msg}
      {cf && <div className="muted small">Open the Login tab to paste session cookies.</div>}
    </div>
  );
}

export function Badge({ children }: { children: React.ReactNode }) {
  return <span className="badge">{children}</span>;
}
