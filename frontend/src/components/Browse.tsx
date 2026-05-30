import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Alert, Button, Card, Center, Group, Image, SimpleGrid, Text, TextInput } from "@mantine/core";
import { api, imgUrl, Novel } from "../api";
import { useAsync, Spinner, ErrorBanner } from "../ui";
import { useCurrentSource } from "./SourceLayout";

type Mode = "Popular" | "Latest" | "Search";

export function Browse({ mode }: { mode: Mode }) {
  const source = useCurrentSource();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const submitted = sp.get("q") ?? "world";
  const [query, setQuery] = useState(submitted);

  const state = useAsync<Novel[]>(() => {
    if (mode === "Popular") return api.popular(source.id);
    if (mode === "Latest") return api.latest(source.id);
    return api.search(source.id, submitted);
  }, [source.id, mode, submitted]);

  const openNovel = (n: Novel) =>
    navigate(
      `/source/${source.id}/novel?u=${encodeURIComponent(n.url)}&t=${encodeURIComponent(n.title || "")}`,
    );

  return (
    <div>
      {mode === "Search" && (
        <Group mb="md">
          <TextInput
            value={query}
            placeholder="search query…"
            onChange={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && setSp({ q: query })}
            style={{ flex: 1, maxWidth: 360 }}
          />
          <Button onClick={() => setSp({ q: query })}>Search</Button>
        </Group>
      )}
      {state.loading && <Spinner />}
      {state.error && <ErrorBanner msg={state.error} />}
      {state.data && <Grid list={state.data} sourceId={source.id} onOpen={openNovel} />}
    </div>
  );
}

function Grid({
  list,
  sourceId,
  onOpen,
}: {
  list: Novel[];
  sourceId: number;
  onOpen: (n: Novel) => void;
}) {
  if (list.length === 0)
    return (
      <Alert color="yellow" variant="light">
        empty — 0 novels returned
      </Alert>
    );
  return (
    <>
      <Text c="dimmed" size="xs" mb="xs">
        {list.length} items
      </Text>
      <SimpleGrid cols={{ base: 2, xs: 3, sm: 4, lg: 6 }} spacing="md">
        {list.map((n, i) => (
          <NovelCard key={`${n.url}-${i}`} n={n} sourceId={sourceId} onOpen={onOpen} />
        ))}
      </SimpleGrid>
    </>
  );
}

function NovelCard({
  n,
  sourceId,
  onOpen,
}: {
  n: Novel;
  sourceId: number;
  onOpen: (n: Novel) => void;
}) {
  const [broken, setBroken] = useState(false);
  const noimg = broken || !n.thumbnailUrl;
  return (
    <Card padding="xs" radius="md" withBorder onClick={() => onOpen(n)} style={{ cursor: "pointer" }} title={n.title}>
      <Card.Section>
        {noimg ? (
          <Center h={180} c="pink.4" bg="dark.5">
            no cover
          </Center>
        ) : (
          <Image
            src={imgUrl(sourceId, n.thumbnailUrl!)}
            h={180}
            loading="lazy"
            onError={() => setBroken(true)}
          />
        )}
      </Card.Section>
      <Text size="xs" mt={6} lineClamp={2}>
        {n.title || "(untitled)"}
      </Text>
    </Card>
  );
}
