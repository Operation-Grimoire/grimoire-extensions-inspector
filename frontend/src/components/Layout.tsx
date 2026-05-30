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
  NumberInput,
  Popover,
  ScrollArea,
  Select,
  Text,
  TextInput,
} from "@mantine/core";
import { SourceMeta } from "../api";
import { ErrorBanner } from "../ui";
import { useSources } from "../sources";
import { CHAPTER_CONCURRENCY_MAX, useSettings } from "../settings";

const TAB_LABELS: Record<string, string> = {
  popular: "Popular",
  latest: "Latest",
  search: "Search",
  filters: "Filters",
  config: "Config",
  login: "Login",
  cookies: "Cookies",
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
          <SettingsMenu />
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

type Sort = "name" | "lang" | "id";

const SORTERS: Record<Sort, (a: SourceMeta, b: SourceMeta) => number> = {
  name: (a, b) => a.name.localeCompare(b.name),
  lang: (a, b) => a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name),
  id: (a, b) => a.id - b.id,
};

function Sidebar({ sources }: { sources: SourceMeta[] }) {
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<Sort>("name");
  const { pathname } = useLocation();
  const filtered = sources
    .filter(
      (s) => !filter || s.name.toLowerCase().includes(filter.toLowerCase()) || s.lang.includes(filter),
    )
    .sort(SORTERS[sort]);
  return (
    <>
      <TextInput
        placeholder="filter sources…"
        value={filter}
        onChange={(e) => setFilter(e.currentTarget.value)}
        mb="xs"
        size="xs"
      />
      <Select
        size="xs"
        mb="sm"
        value={sort}
        onChange={(v) => setSort((v as Sort) ?? "name")}
        allowDeselect={false}
        data={[
          { value: "name", label: "Sort: Name (A→Z)" },
          { value: "lang", label: "Sort: Language" },
          { value: "id", label: "Sort: ID" },
        ]}
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

function SettingsMenu() {
  const [settings, set] = useSettings();
  const setConcurrency = (v: number | string) => {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return;
    const clamped = Math.min(CHAPTER_CONCURRENCY_MAX, Math.max(1, Math.round(n)));
    set((s) => ({ ...s, chapterConcurrency: clamped }));
  };
  return (
    <Popover width={300} position="bottom-end" withArrow shadow="md">
      <Popover.Target>
        <Button size="xs" variant="default">
          ⚙ Settings
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Text fw={600} size="sm" mb="xs">
          Settings
        </Text>
        <NumberInput
          label="Parallel chapter-page fetches"
          description="Load paginated chapter lists faster (1 = sequential)"
          min={1}
          max={CHAPTER_CONCURRENCY_MAX}
          value={settings.chapterConcurrency}
          onChange={setConcurrency}
        />
        <Text size="xs" c="dimmed" mt="xs">
          Saved in this browser.
        </Text>
      </Popover.Dropdown>
    </Popover>
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
