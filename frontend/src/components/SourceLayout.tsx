import { Link, Outlet, useLocation, useOutletContext, useParams } from "react-router-dom";
import { Anchor, Box, Button, Group, Stack, Tabs, Text, Title, Tooltip } from "@mantine/core";
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

  // Tabs a source can't serve are greyed out with a reason. Capabilities come
  // from the @SourceInfo scan (see SourceOps.capabilities); Cookies always
  // applies (any source can be cookie/Cloudflare-gated).
  const caps = source.capabilities;
  const browsable = caps.includes("CatalogueSource");
  const disabledReason = (t: (typeof TABS)[number]): string | null => {
    switch (t) {
      case "popular":
      case "latest":
      case "search":
      case "filters":
        return browsable ? null : "source is not a CatalogueSource — nothing to browse";
      case "config":
        return caps.includes("ConfigurableSource") ? null : "source has no configurable preferences";
      case "login":
        return caps.includes("WebViewLoginSource") ? null : "source has no WebView login";
      default:
        return null;
    }
  };

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
          {TABS.map((t) => {
            const reason = disabledReason(t);
            if (reason) {
              return (
                <Tooltip key={t} label={reason} withArrow>
                  <Box component="span" style={{ display: "inline-flex" }}>
                    <Tabs.Tab value={t} disabled>
                      {LABEL[t]}
                    </Tabs.Tab>
                  </Box>
                </Tooltip>
              );
            }
            return (
              <Tabs.Tab key={t} value={t} renderRoot={(props) => <Link to={t} {...props} />}>
                {LABEL[t]}
              </Tabs.Tab>
            );
          })}
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
