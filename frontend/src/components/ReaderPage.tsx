import { Link, useSearchParams } from "react-router-dom";
import { Button, Divider, Group, Image, Stack, Text, Title } from "@mantine/core";
import { api, imgUrl, Page } from "../api";
import { useAsync, Spinner, ErrorBanner } from "../ui";
import { useCurrentSource } from "./SourceLayout";

export function ReaderPage() {
  const source = useCurrentSource();
  const [sp] = useSearchParams();
  const url = sp.get("u") ?? "";
  const name = sp.get("t") || "(unnamed)";
  const nu = sp.get("nu");
  const nt = sp.get("nt") || "Novel";

  const state = useAsync<Page[]>(() => api.pages(source.id, url), [source.id, url]);

  const backTo = nu
    ? `/source/${source.id}/novel?u=${encodeURIComponent(nu)}&t=${encodeURIComponent(nt)}`
    : `/source/${source.id}/popular`;

  return (
    <Stack gap="sm">
      <Group>
        <Button component={Link} to={backTo} variant="default" size="xs">
          ← chapters
        </Button>
        <Title order={4}>{name}</Title>
      </Group>
      {state.loading && <Spinner label="loading pages…" />}
      {state.error && <ErrorBanner msg={state.error} />}
      {state.data && (
        <Stack gap="sm" maw={720}>
          <Text c="dimmed" size="xs">
            {state.data.length} pages
          </Text>
          {state.data.map((p) => (
            <PageView key={p.index} page={p} sourceId={source.id} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function PageView({ page, sourceId }: { page: Page; sourceId: number }) {
  if (page.imageUrl) return <Image src={imgUrl(sourceId, page.imageUrl)} />;
  if (page.formattedText)
    return <Text component="div" dangerouslySetInnerHTML={{ __html: page.formattedText }} />;
  if (page.isSeparator) return <Divider />;
  return (
    <Text>
      {page.text || (
        <Text span c="red">
          ⚠ empty page
        </Text>
      )}
    </Text>
  );
}
