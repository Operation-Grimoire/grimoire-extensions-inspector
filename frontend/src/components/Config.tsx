import { useEffect, useState } from "react";
import { Button, Group, PasswordInput, Select, Stack, Switch, Text, TextInput } from "@mantine/core";
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

      {prefs.length === 0 ? (
        !hasHosts && <Text c="dimmed">this source has no configurable preferences</Text>
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

// MultiHostSource: pick which interchangeable mirror to route requests through.
function HostSection() {
  const source = useCurrentSource();
  const initial = source.activeHost ?? source.hosts[0] ?? "";
  const [active, setActive] = useState(initial);
  const [status, setStatus] = useState<string>();

  // The active host may be one the source picked itself and not in `hosts`.
  const data = Array.from(new Set([...source.hosts, ...(active ? [active] : [])]));

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
        Multi-host source — {source.hosts.length} interchangeable mirrors. Pin which one requests
        route through (e.g. when one is down).
      </Text>
      <Group>
        <Select
          data={data}
          value={active}
          onChange={change}
          allowDeselect={false}
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
