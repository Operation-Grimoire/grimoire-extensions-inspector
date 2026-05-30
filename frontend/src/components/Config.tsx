import { useEffect, useState } from "react";
import { Button, Group, PasswordInput, Stack, Switch, Text, TextInput } from "@mantine/core";
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
  if (prefs.length === 0) return <Text c="dimmed">this source has no configurable preferences</Text>;

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
  );
}
