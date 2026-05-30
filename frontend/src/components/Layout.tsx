import { useState } from "react";
import { Link, Outlet, useLocation, useSearchParams } from "react-router-dom";
import {
  Anchor,
  AppShell,
  Box,
  Breadcrumbs,
  Button,
  Group,
  NavLink,
  ScrollArea,
  Text,
  TextInput,
} from "@mantine/core";
import { SourceMeta } from "../api";
import { ErrorBanner } from "../ui";
import { useSources } from "../sources";

const TAB_LABELS: Record<string, string> = {
  popular: "Popular",
  latest: "Latest",
  search: "Search",
  filters: "Filters",
  config: "Config",
  login: "Login",
};

export function Layout() {
  const sources = useSources();
  const list = sources.data ?? [];

  return (
    <AppShell header={{ height: 56 }} navbar={{ width: 290, breakpoint: "sm" }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" gap="md" wrap="nowrap">
          <Anchor component={Link} to="/" fw={700} c="bright" underline="never">
            Grimoire Source Inspector
          </Anchor>
          <Text c="dimmed" size="sm" visibleFrom="md">
            {sources.loading ? "loading…" : `${list.length} sources`}
          </Text>
          <Crumbs sources={list} />
          <Box style={{ flex: 1 }} />
          <Button component={Link} to="/run" size="xs">
            Run full suite
          </Button>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm">
        <Sidebar sources={list} />
      </AppShell.Navbar>

      <AppShell.Main>
        {sources.error && <ErrorBanner msg={sources.error} />}
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}

function Sidebar({ sources }: { sources: SourceMeta[] }) {
  const [filter, setFilter] = useState("");
  const { pathname } = useLocation();
  const filtered = sources.filter(
    (s) => !filter || s.name.toLowerCase().includes(filter.toLowerCase()) || s.lang.includes(filter),
  );
  return (
    <>
      <TextInput
        placeholder="filter sources…"
        value={filter}
        onChange={(e) => setFilter(e.currentTarget.value)}
        mb="sm"
        size="xs"
      />
      <ScrollArea type="hover" style={{ flex: 1 }}>
        {filtered.map((s) => (
          <NavLink
            key={s.id}
            component={Link}
            to={`/source/${s.id}`}
            active={pathname.startsWith(`/source/${s.id}`)}
            label={
              <Group gap={6} wrap="nowrap">
                <Text size="sm" truncate>
                  {s.name}
                </Text>
                <Text size="xs" c="dimmed">
                  {s.lang}
                </Text>
              </Group>
            }
            description={s.capabilities.join(", ")}
          />
        ))}
      </ScrollArea>
    </>
  );
}

interface Crumb {
  label: string;
  to?: string;
}

function Crumbs({ sources }: { sources: SourceMeta[] }) {
  const { pathname } = useLocation();
  const [sp] = useSearchParams();
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return null;

  const crumbs: Crumb[] = [{ label: "Sources", to: "/" }];

  if (parts[0] === "run") {
    crumbs.push({ label: "Run report" });
  } else if (parts[0] === "source") {
    const id = parts[1];
    const name = sources.find((s) => String(s.id) === id)?.name ?? `#${id}`;
    crumbs.push({ label: name, to: `/source/${id}/popular` });

    const sub = parts[2];
    if (sub && TAB_LABELS[sub]) {
      crumbs.push({ label: TAB_LABELS[sub] });
    } else if (sub === "novel") {
      crumbs.push({ label: sp.get("t") || "Novel" });
    } else if (sub === "read") {
      const nu = sp.get("nu");
      const nt = sp.get("nt") || "Novel";
      if (nu) {
        crumbs.push({
          label: nt,
          to: `/source/${id}/novel?u=${encodeURIComponent(nu)}&t=${encodeURIComponent(nt)}`,
        });
      }
      crumbs.push({ label: sp.get("t") || "Chapter" });
    }
  }

  return (
    <Breadcrumbs separator="/" visibleFrom="sm" styles={{ root: { flexWrap: "nowrap", overflow: "hidden" } }}>
      {crumbs.map((c, i) =>
        c.to ? (
          <Anchor key={i} component={Link} to={c.to} size="sm">
            {c.label}
          </Anchor>
        ) : (
          <Text key={i} size="sm" c="dimmed" truncate maw={220}>
            {c.label}
          </Text>
        ),
      )}
    </Breadcrumbs>
  );
}
