import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Alert,
  Badge,
  Button,
  Code,
  Group,
  Image,
  Stack,
  Table,
  Text,
  UnstyledButton,
} from "@mantine/core";
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

  return (
    <Stack gap="md">
      <Group align="flex-start" gap="lg" wrap="nowrap">
        {novel.thumbnailUrl ? (
          <Image
            src={imgUrl(source.id, novel.thumbnailUrl)}
            h={200}
            w={140}
            radius="md"
            fit="contain"
            flex="0 0 auto"
          />
        ) : (
          <Alert color="yellow" variant="light" w={140} flex="0 0 auto">
            no thumbnailUrl
          </Alert>
        )}

        <Table withRowBorders={false} verticalSpacing={5} style={{ flex: 1 }} layout="fixed">
          <Table.Tbody>
            <Field label="Title">
              <Val s={novel.title} />
            </Field>
            <Field label="Author">
              <Val s={novel.author} />
            </Field>
            <Field label="Status">
              <Val s={novel.status} />
            </Field>
            <Field label="Genres">
              {novel.genres.length > 0 ? (
                <Group gap={4}>
                  {novel.genres.map((g, i) => (
                    <Badge key={i} variant="light" color="gray" radius="sm">
                      {g}
                    </Badge>
                  ))}
                </Group>
              ) : (
                <Empty />
              )}
            </Field>
            <Field label="Rating">
              {novel.rating != null ? (
                <Text size="sm">
                  {novel.rating}
                  {novel.ratingCount != null && (
                    <Text span c="dimmed">
                      {" "}
                      ({novel.ratingCount} votes)
                    </Text>
                  )}
                </Text>
              ) : (
                <Empty />
              )}
            </Field>
            <Field label="Initialized">
              <Badge variant="light" color={novel.initialized ? "green" : "gray"} radius="sm">
                {String(novel.initialized)}
              </Badge>
            </Field>
            <Field label="URL">
              <Mono>{novel.url}</Mono>
            </Field>
            <Field label="Thumbnail">{novel.thumbnailUrl ? <Mono>{novel.thumbnailUrl}</Mono> : <Empty />}</Field>
          </Table.Tbody>
        </Table>
      </Group>

      <div>
        <Text fw={600} size="sm" c="dimmed" mb={4}>
          Description
        </Text>
        {novel.description?.trim() ? (
          <Text size="sm" maw={760} style={{ whiteSpace: "pre-wrap" }}>
            {novel.description}
          </Text>
        ) : (
          <Empty />
        )}
      </div>

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

/** One labeled row in the details table; values render exactly as the source
 *  returned them, with empties called out. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Table.Tr>
      <Table.Td w={110} style={{ verticalAlign: "top" }}>
        <Text fw={600} size="sm" c="dimmed">
          {label}
        </Text>
      </Table.Td>
      <Table.Td>{children}</Table.Td>
    </Table.Tr>
  );
}

function Val({ s }: { s?: string | null }) {
  return s && s.trim() ? <Text size="sm">{s}</Text> : <Empty />;
}

function Empty() {
  return (
    <Text size="sm" c="yellow">
      (empty)
    </Text>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <Code style={{ wordBreak: "break-all", whiteSpace: "normal" }}>{children}</Code>
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
