import { Link, Outlet, useLocation, useOutletContext, useParams } from "react-router-dom";
import { Anchor, Button, Group, Stack, Tabs, Text, Title } from "@mantine/core";
import { SourceMeta } from "../api";
import { Badge, Spinner } from "../ui";
import { useSource, useSources } from "../sources";

const TABS = ["popular", "latest", "search", "filters", "config", "login", "cookies"] as const;
const LABEL: Record<(typeof TABS)[number], string> = {
  popular: "Popular",
  latest: "Latest",
  search: "Search",
  filters: "Filters",
  config: "Config",
  login: "Login",
  cookies: "Cookies",
};

export function SourceLayout() {
  const { id } = useParams();
  const sources = useSources();
  const source = useSource(Number(id));
  const { pathname } = useLocation();
  const activeTab = pathname.split("/")[3];

  if (!source) {
    if (sources.loading) return <Spinner />;
    return <Text c="dimmed">Unknown source “{id}”.</Text>;
  }

  // key on id so per-tab/page state resets when switching sources.
  return (
    <Stack key={source.id} gap="md">
      <Stack gap={4}>
        <Group justify="space-between" wrap="nowrap">
          <Title order={3}>{source.name}</Title>
          <Button component={Link} to={`/run?source=${source.id}`} variant="default" size="xs">
            Run suite on this source
          </Button>
        </Group>
        <Text c="dimmed" size="sm">
          {source.lang} ·{" "}
          <Anchor href={source.baseUrl} target="_blank" rel="noreferrer">
            {source.baseUrl}
          </Anchor>{" "}
          · v{source.versionCode}
        </Text>
        <Group gap={6}>
          {source.capabilities.map((c) => (
            <Badge key={c}>{c}</Badge>
          ))}
          {source.hasDynamicFilters && <Badge>dynamicFilters</Badge>}
        </Group>
      </Stack>

      <Tabs value={activeTab ?? null}>
        <Tabs.List>
          {TABS.map((t) => (
            <Tabs.Tab key={t} value={t} renderRoot={(props) => <Link to={t} {...props} />}>
              {LABEL[t]}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>

      <Outlet context={source} />
    </Stack>
  );
}

/** Child pages read the current source from the outlet context. */
export function useCurrentSource(): SourceMeta {
  return useOutletContext<SourceMeta>();
}
