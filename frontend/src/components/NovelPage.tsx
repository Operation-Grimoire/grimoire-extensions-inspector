import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Alert, Badge, Button, Group, Image, Stack, Text, Title, UnstyledButton } from "@mantine/core";
import { api, Chapter, imgUrl, Novel } from "../api";
import { useAsync, Spinner, ErrorBanner } from "../ui";
import { useCurrentSource } from "./SourceLayout";

export function NovelPage() {
  const source = useCurrentSource();
  const [sp] = useSearchParams();
  const url = sp.get("u") ?? "";
  const details = useAsync<Novel>(() => api.novel(source.id, url), [source.id, url]);

  return (
    <div>
      {details.loading && <Spinner />}
      {details.error && <ErrorBanner msg={details.error} />}
      {details.data && <Detail novel={details.data} />}
    </div>
  );
}

function Detail({ novel }: { novel: Novel }) {
  const source = useCurrentSource();
  const navigate = useNavigate();
  const [showChapters, setShowChapters] = useState(false);

  const read = (c: Chapter) => {
    const q = new URLSearchParams({
      u: c.url,
      t: c.name || "(unnamed)",
      nu: novel.url,
      nt: novel.title || "",
    });
    navigate(`/source/${source.id}/read?${q.toString()}`);
  };

  const meta = [novel.author, novel.status, novel.genres.join(", ")].filter(Boolean).join(" · ");

  return (
    <Stack gap="sm">
      <Title order={3}>{novel.title || "(untitled)"}</Title>
      {meta && (
        <Text c="dimmed" size="sm">
          {meta}
        </Text>
      )}
      {novel.thumbnailUrl ? (
        <Image src={imgUrl(source.id, novel.thumbnailUrl)} h={220} w="auto" radius="md" fit="contain" />
      ) : (
        <Alert color="yellow" variant="light">
          empty thumbnailUrl
        </Alert>
      )}
      <Text maw={720}>{novel.description || "(no description)"}</Text>
      {!showChapters ? (
        <Button variant="default" w="fit-content" onClick={() => setShowChapters(true)}>
          Load chapters
        </Button>
      ) : (
        <Chapters url={novel.url} onRead={read} />
      )}
    </Stack>
  );
}

function Chapters({ url, onRead }: { url: string; onRead: (c: Chapter) => void }) {
  const source = useCurrentSource();
  const state = useAsync<Chapter[]>(() => api.chapters(source.id, url), [source.id, url]);
  if (state.loading) return <Spinner label="loading chapters…" />;
  if (state.error) return <ErrorBanner msg={state.error} />;
  const list = state.data ?? [];
  return (
    <Stack gap={0}>
      <Text c="dimmed" size="xs" mb="xs">
        {list.length} chapters
      </Text>
      {list.map((c, i) => (
        <UnstyledButton
          key={`${c.url}-${i}`}
          onClick={() => !c.locked && onRead(c)}
          disabled={c.locked}
          p="xs"
          style={{
            borderBottom: "1px solid var(--mantine-color-dark-4)",
            cursor: c.locked ? "default" : "pointer",
            opacity: c.locked ? 0.7 : 1,
          }}
        >
          <Group justify="space-between">
            <Text size="sm">{c.name || "(unnamed)"}</Text>
            {c.locked && (
              <Badge size="xs" color="yellow" variant="outline">
                locked
              </Badge>
            )}
          </Group>
        </UnstyledButton>
      ))}
    </Stack>
  );
}
