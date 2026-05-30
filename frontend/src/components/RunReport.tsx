import { Link, useSearchParams } from "react-router-dom";
import { Accordion, Anchor, Badge, Button, Card, Code, Group, Stack, Text } from "@mantine/core";
import { api, Diagnostic, RunReport as Report, SourceReport, StageResult } from "../api";
import { useAsync, Spinner, ErrorBanner } from "../ui";
import { useSettings } from "../settings";

const STATUS_COLOR: Record<string, string> = {
  ok: "green",
  warn: "yellow",
  error: "red",
  skipped: "gray",
  info: "gray",
};

export function RunReport() {
  const [sp] = useSearchParams();
  const sourceFilter = sp.get("source") ?? undefined;
  const [settings] = useSettings();
  const state = useAsync<Report>(
    () => api.run(sourceFilter, settings.chapterConcurrency),
    [sourceFilter, settings.chapterConcurrency],
  );

  return (
    <Stack gap="md">
      <Group gap="xs">
        {state.data && (
          <>
            <Text>{state.data.totals.sources} sources</Text>
            <Text c="red">· {state.data.totals.errors} errors</Text>
            <Text c="yellow">· {state.data.totals.warnings} warnings</Text>
            <Text c="dimmed">· {state.data.durationMs}ms</Text>
          </>
        )}
        <Button
          size="xs"
          variant="default"
          ml="auto"
          loading={state.loading}
          onClick={state.reload}
        >
          {state.loading ? "running…" : "Rerun"}
        </Button>
      </Group>
      {state.loading && <Spinner label="running suite (live network)…" />}
      {state.error && <ErrorBanner msg={state.error} />}
      {state.data?.sources.map((sr) => (
        <SourceCard key={sr.source.id} sr={sr} />
      ))}
    </Stack>
  );
}

function SourceCard({ sr }: { sr: SourceReport }) {
  const open = sr.stages.filter((s) => s.status === "error" || s.status === "warn").map((s) => s.stage);
  return (
    <Card withBorder radius="md" padding="sm">
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <Badge variant="dot" color={sr.ok ? "green" : "red"} size="lg">
            {sr.source.name}
          </Badge>
          <Text c="dimmed" size="sm">
            ({sr.source.lang}) · errors={sr.errors} warnings={sr.warnings}
          </Text>
        </Group>
        <Anchor component={Link} to={`/source/${sr.source.id}/popular`} size="sm">
          browse →
        </Anchor>
      </Group>
      {sr.probe && (
        <Text size="xs" c="dimmed" mb="xs">
          probed novel: {sr.probe.title || "(untitled)"} ·{" "}
          <Anchor
            component={Link}
            to={`/source/${sr.source.id}/novel?u=${encodeURIComponent(sr.probe.url)}&t=${encodeURIComponent(sr.probe.title)}`}
            size="xs"
          >
            {sr.probe.url}
          </Anchor>
        </Text>
      )}
      <Accordion multiple defaultValue={open} variant="separated">
        {sr.stages.map((st) => (
          <StageItem key={st.stage} st={st} />
        ))}
      </Accordion>
    </Card>
  );
}

function StageItem({ st }: { st: StageResult }) {
  const counts = Object.entries(st.counts)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  return (
    <Accordion.Item value={st.stage}>
      <Accordion.Control>
        <Group gap="xs">
          <Badge variant="dot" color={STATUS_COLOR[st.status] ?? "gray"} size="sm">
            {st.stage}
          </Badge>
          <Text c="dimmed" size="xs">
            {st.status} {counts}
          </Text>
          {st.target && (
            <Code style={{ fontSize: 11, wordBreak: "break-all" }}>{st.target}</Code>
          )}
        </Group>
      </Accordion.Control>
      <Accordion.Panel>
        {st.diagnostics.length > 0 ? (
          <Stack gap={4}>
            {st.diagnostics.map((d, i) => (
              <DiagRow key={i} d={d} />
            ))}
          </Stack>
        ) : (
          <Text c="dimmed" size="xs">
            no diagnostics
          </Text>
        )}
      </Accordion.Panel>
    </Accordion.Item>
  );
}

function DiagRow({ d }: { d: Diagnostic }) {
  const color = d.severity === "ERROR" ? "red" : d.severity === "WARN" ? "yellow" : "dimmed";
  // Backend caps samples at 5; if we got that many there are likely more.
  const truncated = d.samples.length >= 5;
  return (
    <div>
      <Text size="sm" c={color}>
        {d.severity} {d.code}: {d.message}
      </Text>
      {d.samples.length > 0 && (
        <Stack gap={0} mt={2} ml="md">
          {d.samples.map((s, i) => (
            <Text key={i} size="xs" c="dimmed" style={{ fontFamily: "monospace", wordBreak: "break-all" }}>
              • {s}
            </Text>
          ))}
          {truncated && (
            <Text size="xs" c="dimmed">
              …(showing first {d.samples.length})
            </Text>
          )}
        </Stack>
      )}
    </div>
  );
}
