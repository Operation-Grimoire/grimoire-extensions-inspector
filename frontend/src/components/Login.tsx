import { useState } from "react";
import { Anchor, Button, Code, Group, Stack, Text, Textarea } from "@mantine/core";
import { api, LoginDto } from "../api";
import { useAsync, Spinner, ErrorBanner, errMsg } from "../ui";
import { useCurrentSource } from "./SourceLayout";

export function Login() {
  const source = useCurrentSource();
  const state = useAsync<LoginDto>(() => api.login(source.id), [source.id]);
  const [cookies, setCookies] = useState("");
  const [status, setStatus] = useState<string>();

  if (state.loading) return <Spinner />;
  if (state.error) return <ErrorBanner msg={state.error} />;
  const info = state.data;
  if (!info || (info.loginUrl == null && info.isLoggedIn == null))
    return <Text c="dimmed">this source has no WebView login</Text>;

  const inject = async () => {
    try {
      await api.cookies(source.id, cookies);
      setStatus("injected ✓ — re-open a tab to use the session");
    } catch (e) {
      setStatus(errMsg(e));
    }
  };

  return (
    <Stack gap="sm" maw={640}>
      <Text size="sm">
        loginUrl:{" "}
        {info.loginUrl ? (
          <Anchor href={info.loginUrl} target="_blank" rel="noreferrer">
            {info.loginUrl}
          </Anchor>
        ) : (
          "—"
        )}
      </Text>
      <Text size="sm">
        isLoggedIn:{" "}
        <Text span c={info.isLoggedIn ? "green" : "yellow"}>
          {String(info.isLoggedIn)}
        </Text>
      </Text>
      <Text c="dimmed" size="xs">
        Headless can’t run the interactive WebView login. Paste session cookies captured from a
        browser (<Code>name=value; name2=value2</Code>) to exercise login-gated calls:
      </Text>
      <Textarea
        rows={3}
        placeholder="cf_clearance=…; sessionid=…"
        value={cookies}
        onChange={(e) => setCookies(e.currentTarget.value)}
      />
      <Group>
        <Button onClick={inject} disabled={!cookies.trim()}>
          Inject cookies
        </Button>
        {status && (
          <Text c="dimmed" size="sm">
            {status}
          </Text>
        )}
      </Group>
    </Stack>
  );
}
