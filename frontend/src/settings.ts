import { useLocalStorage } from "@mantine/hooks";

// Global, browser-persisted settings. Mantine's useLocalStorage keeps every
// hook instance in this tab in sync, so no provider is needed.
export interface Settings {
  /** Parallel chapter-page fetches for paginated sources (1 = sequential). */
  chapterConcurrency: number;
}

export const DEFAULT_SETTINGS: Settings = {
  chapterConcurrency: 4,
};

export const CHAPTER_CONCURRENCY_MAX = 16;

export function useSettings() {
  const [stored, set] = useLocalStorage<Settings>({
    key: "inspector.settings",
    defaultValue: DEFAULT_SETTINGS,
  });
  // Merge defaults so older saved blobs gain new keys.
  const settings: Settings = { ...DEFAULT_SETTINGS, ...stored };
  return [settings, set] as const;
}
