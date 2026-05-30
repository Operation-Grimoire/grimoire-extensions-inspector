import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Code,
  Divider,
  Group,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { api } from "../api";
import { useAsync, Spinner, ErrorBanner, errMsg } from "../ui";
import { useCurrentSource } from "./SourceLayout";

export function CookiesPage() {
  const source = useCurrentSource();
  const [url, setUrl] = useState(source.baseUrl);
  const current = useAsync(() => api.getCookies(source.id, url), [source.id]);
  const [cookies, setCookies] = useState("");
  const [status, setStatus] = useState<string>();

  const inject = async () => {
    try {
      await api.cookies(source.id, cookies, url || undefined);
      setStatus("injected ✓ — re-open a browse tab to use the session");
      setCookies("");
      current.reload();
    } catch (e) {
      setStatus(errMsg(e));
    }
  };

  const clear = async () => {
    try {
      await api.clearCookies(source.id);
      setStatus("cleared ✓");
      current.reload();
    } catch (e) {
      setStatus(errMsg(e));
    }
  };

  return (
    <Stack gap="sm" maw={680}>
      <Alert color="blue" variant="light" title="Bypassing Cloudflare / login walls">
        Headless can’t run the WebView challenge. Open the site in your own browser, pass the
        Cloudflare check (or log in), copy the cookies, and paste them here — they go into the
        in-memory cookie jar and replay on this source’s requests.
        <Text size="xs" c="dimmed" mt={6}>
          <Code>cf_clearance</Code> is bound to the User-Agent + IP that solved the challenge — turn
          on the User-Agent match below so requests use your browser’s UA, or it’ll be rejected.
        </Text>
      </Alert>

      <UaSection />
      <Divider />

      <TextInput
        label="Target URL"
        description="cookies are scoped to this URL's host (defaults to the source base URL)"
        value={url}
        onChange={(e) => setUrl(e.currentTarget.value)}
      />

      <Textarea
        label="Paste cookies"
        placeholder="cf_clearance=…; sessionid=…"
        rows={3}
        value={cookies}
        onChange={(e) => setCookies(e.currentTarget.value)}
      />

      <Group>
        <Button onClick={inject} disabled={!cookies.trim()}>
          Inject cookies
        </Button>
        <Button variant="default" onClick={clear}>
          Clear all
        </Button>
        {status && (
          <Text c="dimmed" size="sm">
            {status}
          </Text>
        )}
      </Group>

      <div>
        <Group gap="xs" mb={4}>
          <Text fw={600} size="sm">
            Currently stored
          </Text>
          <Button variant="subtle" size="compact-xs" onClick={current.reload}>
            refresh
          </Button>
        </Group>
        {current.loading && <Spinner />}
        {current.error && <ErrorBanner msg={current.error} />}
        {current.data &&
          (current.data.cookies ? (
            <Code block>{current.data.cookies.split("; ").join(";\n")}</Code>
          ) : (
            <Text c="dimmed" size="sm">
              no cookies stored for {current.data.url}
            </Text>
          ))}
      </div>
    </Stack>
  );
}

// Global (all sources) — overrides the UA the harness sends so a browser's
// cf_clearance is accepted. Prefilled with this browser's own UA, which is the
// one that copied the cookie.
function UaSection() {
  const state = useAsync(() => api.ua(), []);
  const [ua, setUa] = useState(navigator.userAgent);
  const [on, setOn] = useState(false);
  const [status, setStatus] = useState<string>();

  useEffect(() => {
    if (state.data) {
      setOn(state.data.overridden);
      if (state.data.overridden) setUa(state.data.userAgent);
    }
  }, [state.data]);

  const push = async (value: string) => {
    try {
      const res = await api.setUa(value);
      setOn(res.overridden);
      setStatus(res.overridden ? "UA override on ✓" : "UA override off — using default");
    } catch (e) {
      setStatus(errMsg(e));
    }
  };

  const toggle = (checked: boolean) => {
    setOn(checked);
    push(checked ? ua : "");
  };

  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <div>
          <Text fw={600} size="sm">
            Match a browser User-Agent
          </Text>
          <Text c="dimmed" size="xs">
            applies to all sources; required for a browser’s <Code>cf_clearance</Code> to work
          </Text>
        </div>
        <Switch checked={on} onChange={(e) => toggle(e.currentTarget.checked)} />
      </Group>

      <TextInput
        value={ua}
        disabled={!on}
        onChange={(e) => setUa(e.currentTarget.value)}
        styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)", fontSize: 12 } }}
      />
      <Group>
        <Button
          variant="default"
          size="xs"
          disabled={!on}
          onClick={() => setUa(navigator.userAgent)}
        >
          Use this browser
        </Button>
        <Button size="xs" disabled={!on} onClick={() => push(ua)}>
          Apply
        </Button>
        {state.loading ? (
          <Text c="dimmed" size="xs">
            loading…
          </Text>
        ) : (
          status && (
            <Text c="dimmed" size="xs">
              {status}
            </Text>
          )
        )}
      </Group>
    </Stack>
  );
}
