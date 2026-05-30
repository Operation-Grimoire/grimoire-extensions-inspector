import { createContext, useContext } from "react";
import { api, SourceMeta } from "./api";
import { useAsync, AsyncState } from "./ui";

// Sources are loaded once at the top of the app and shared via context so the
// sidebar, breadcrumbs, and every source page read the same list (and a source
// page gets its SourceMeta without re-fetching).
const SourcesCtx = createContext<AsyncState<SourceMeta[]> | null>(null);

export function SourcesProvider({ children }: { children: React.ReactNode }) {
  const state = useAsync(() => api.sources(), []);
  return <SourcesCtx.Provider value={state}>{children}</SourcesCtx.Provider>;
}

export function useSources(): AsyncState<SourceMeta[]> {
  const ctx = useContext(SourcesCtx);
  if (!ctx) throw new Error("useSources must be used within <SourcesProvider>");
  return ctx;
}

export function useSource(id: number | undefined): SourceMeta | undefined {
  const { data } = useSources();
  return data?.find((s) => s.id === id);
}
