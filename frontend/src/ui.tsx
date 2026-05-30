import { useCallback, useEffect, useState } from "react";
import { Alert, Badge as MBadge, Group, Loader, Text } from "@mantine/core";
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
  return (
    <Group gap="xs" py="md">
      <Loader size="sm" />
      <Text c="dimmed" size="sm">
        {label}
      </Text>
    </Group>
  );
}

export function ErrorBanner({ msg }: { msg: string }) {
  // Key off the error code prefix (errMsg formats as "CODE: message"), not any
  // mention of "cloudflare" in the text — a 503 whose message merely quotes a
  // propagated CF string is not a Cloudflare block.
  const cf = /^CLOUDFLARE/i.test(msg);
  return (
    <Alert
      my="sm"
      color={cf ? "yellow" : "red"}
      title={cf ? "Cloudflare blocked" : "Error"}
      variant="light"
    >
      {msg}
      {cf && (
        <Text size="xs" c="dimmed" mt={4}>
          Open the Cookies tab to paste session cookies.
        </Text>
      )}
    </Alert>
  );
}

export function Badge({ children }: { children: React.ReactNode }) {
  return (
    <MBadge variant="light" color="gray" radius="sm">
      {children}
    </MBadge>
  );
}
