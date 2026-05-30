import { useEffect, useState } from "react";
import {
  Button,
  Group,
  MultiSelect,
  PasswordInput,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { api, PrefDto } from "../api";
import { useAsync, Spinner, ErrorBanner, errMsg } from "../ui";
import { useCurrentSource } from "./SourceLayout";

export function Config() {
  const source = useCurrentSource();
  const state = useAsync<PrefDto[]>(() => api.prefs(source.id), [source.id]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string>();

  useEffect(() => {
    if (state.data) {
      const init: Record<string, string> = {};
      state.data.forEach((p) => (init[p.key] = p.default));
      setValues(init);
    }
  }, [state.data]);

  if (state.loading) return <Spinner />;
  if (state.error) return <ErrorBanner msg={state.error} />;
  const prefs = state.data ?? [];
  const hasHosts = source.hosts.length > 0;
  const hasLangs = source.languages.length > 0;
  const noConfig = prefs.length === 0 && !hasHosts && !hasLangs;

  const set = (key: string, val: string) => setValues((v) => ({ ...v, [key]: val }));

  const apply = async () => {
    try {
      await api.setPrefs(source.id, values);
      setStatus("applied ✓");
    } catch (e) {
      setStatus(errMsg(e));
    }
  };

  return (
    <Stack gap="lg">
      {hasHosts && <HostSection />}
      {hasLangs && <LanguageSection />}

      {prefs.length === 0 ? (
        noConfig && <Text c="dimmed">this source has no configurable preferences</Text>
      ) : (
        <Stack gap="md">
          {prefs.map((p) => (
            <Group key={p.key} justify="space-between" align="flex-start" wrap="nowrap">
              <div>
                <Text fw={600} size="sm">
                  {p.title}
                </Text>
                <Text c="dimmed" size="xs">
                  {p.summary || p.key}
                </Text>
              </div>
              {p.type === "switch" ? (
                <Switch
                  checked={values[p.key] === "true"}
                  onChange={(e) => set(p.key, String(e.currentTarget.checked))}
                />
              ) : p.isPassword ? (
                <PasswordInput
                  placeholder={p.default}
                  value={values[p.key] ?? ""}
                  onChange={(e) => set(p.key, e.currentTarget.value)}
                  style={{ minWidth: 240 }}
                />
              ) : (
                <TextInput
                  placeholder={p.default}
                  value={values[p.key] ?? ""}
                  onChange={(e) => set(p.key, e.currentTarget.value)}
                  style={{ minWidth: 240 }}
                />
              )}
            </Group>
          ))}
          <Group>
            <Button onClick={apply}>Apply preferences</Button>
            {status && (
              <Text c="dimmed" size="sm">
                {status}
              </Text>
            )}
          </Group>
        </Stack>
      )}
    </Stack>
  );
}

// MultiLanguageSource: restrict browse/search to a chosen set of languages.
// Loads the currently-enabled set from the backend so it survives tab switches.
function LanguageSection() {
  const source = useCurrentSource();
  const state = useAsync(() => api.languages(source.id), [source.id]);
  const [enabled, setEnabled] = useState<string[]>([]);
  const [status, setStatus] = useState<string>();

  useEffect(() => {
    if (state.data) setEnabled(state.data.enabled);
  }, [state.data]);

  const available = state.data?.available ?? source.languages;

  const change = async (langs: string[]) => {
    setEnabled(langs);
    try {
      await api.setLanguages(source.id, langs);
      setStatus(langs.length === 0 ? "all languages ✓" : `${langs.length} language(s) ✓`);
    } catch (e) {
      setStatus(errMsg(e));
    }
  };

  return (
    <div>
      <Text fw={600} size="sm">
        Content languages
      </Text>
      <Text c="dimmed" size="xs" mb={6}>
        Multi-language source — {available.length} available. Restrict browse/search to a selection
        (none = all).
      </Text>
      <Group>
        <MultiSelect
          data={available}
          value={enabled}
          onChange={change}
          disabled={state.loading}
          placeholder={enabled.length === 0 ? "all languages" : undefined}
          searchable={available.length > 8}
          clearable
          style={{ minWidth: 300 }}
        />
        {status && (
          <Text c="dimmed" size="xs">
            {status}
          </Text>
        )}
      </Group>
    </div>
  );
}

// MultiHostSource: pick which interchangeable mirror to route requests through.
// Reads the active mirror from the backend so it reflects the real state.
function HostSection() {
  const source = useCurrentSource();
  const state = useAsync(() => api.host(source.id), [source.id]);
  const [active, setActive] = useState("");
  const [status, setStatus] = useState<string>();

  useEffect(() => {
    if (state.data) setActive(state.data.active || state.data.hosts[0] || "");
  }, [state.data]);

  const hosts = state.data?.hosts ?? source.hosts;
  // The active host may be one the source picked itself and not in `hosts`.
  const data = Array.from(new Set([...hosts, ...(active ? [active] : [])]));

  const change = async (h: string | null) => {
    if (!h) return;
    setActive(h);
    try {
      const r = await api.setHost(source.id, h);
      setActive(r.active);
      setStatus(`routing through ${r.active} ✓`);
    } catch (e) {
      setStatus(errMsg(e));
    }
  };

  return (
    <div>
      <Text fw={600} size="sm">
        Mirror host
      </Text>
      <Text c="dimmed" size="xs" mb={6}>
        Multi-host source — {hosts.length} interchangeable mirrors. Pin which one requests route
        through (e.g. when one is down).
      </Text>
      <Group>
        <Select
          data={data}
          value={active}
          onChange={change}
          allowDeselect={false}
          disabled={state.loading}
          searchable={data.length > 8}
          style={{ minWidth: 300 }}
        />
        {status && (
          <Text c="dimmed" size="xs">
            {status}
          </Text>
        )}
      </Group>
    </div>
  );
}
