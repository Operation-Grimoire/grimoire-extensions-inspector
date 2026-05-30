import { useState } from "react";
import { Badge, Button, Group, Stack, Text } from "@mantine/core";
import { api, FilterDto } from "../api";
import { useAsync, Spinner, ErrorBanner } from "../ui";
import { useCurrentSource } from "./SourceLayout";

export function Filters() {
  const source = useCurrentSource();
  const [fetchDynamic, setFetchDynamic] = useState(false);
  const state = useAsync<FilterDto[]>(
    () => api.filters(source.id, fetchDynamic),
    [source.id, fetchDynamic],
  );

  return (
    <Stack gap="sm">
      {source.hasDynamicFilters && (
        <Group>
          <Button
            variant="default"
            size="xs"
            onClick={() => setFetchDynamic(true)}
            disabled={fetchDynamic}
          >
            {fetchDynamic ? "fetched" : "Fetch dynamic options"}
          </Button>
          <Text c="dimmed" size="xs">
            this source loads some options over the network
          </Text>
        </Group>
      )}
      {state.loading && <Spinner />}
      {state.error && <ErrorBanner msg={state.error} />}
      {state.data && <FilterList filters={state.data} />}
    </Stack>
  );
}

function FilterList({ filters }: { filters: FilterDto[] }) {
  if (filters.length === 0) return <Text c="dimmed">no filters</Text>;
  return (
    <Stack gap={0}>
      {filters.map((f, i) => (
        <FilterRow key={i} f={f} />
      ))}
    </Stack>
  );
}

function FilterRow({ f }: { f: FilterDto }) {
  return (
    <Stack gap={2} py="xs" style={{ borderBottom: "1px solid var(--mantine-color-dark-4)" }}>
      <Group gap="xs">
        <Text fw={600} size="sm">
          {f.name || "(unnamed)"}
        </Text>
        <Badge size="xs" variant="light" color="gray">
          {f.type}
        </Badge>
      </Group>
      {f.values.length > 0 && (
        <Text c="dimmed" size="xs">
          [{f.values.join(", ")}]
        </Text>
      )}
      {f.children.length > 0 && (
        <Text c="dimmed" size="xs">
          {f.children.length} options
        </Text>
      )}
    </Stack>
  );
}
