import { Link } from "react-router-dom";
import { Anchor, Stack, Text } from "@mantine/core";
import { api, LoginDto } from "../api";
import { useAsync, Spinner, ErrorBanner } from "../ui";
import { useCurrentSource } from "./SourceLayout";

export function Login() {
  const source = useCurrentSource();
  const state = useAsync<LoginDto>(() => api.login(source.id), [source.id]);

  if (state.loading) return <Spinner />;
  if (state.error) return <ErrorBanner msg={state.error} />;
  const info = state.data;
  if (!info || (info.loginUrl == null && info.isLoggedIn == null))
    return (
      <Text c="dimmed">
        this source has no WebView login. To get past Cloudflare or a login wall, paste session
        cookies on the{" "}
        <Anchor component={Link} to={`/source/${source.id}/cookies`}>
          Cookies
        </Anchor>{" "}
        tab.
      </Text>
    );

  return (
    <Stack gap="sm">
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
        Interactive WebView login can’t run headlessly. Use the{" "}
        <Anchor component={Link} to={`/source/${source.id}/cookies`}>
          Cookies
        </Anchor>{" "}
        tab to paste a session captured from a browser.
      </Text>
    </Stack>
  );
}
