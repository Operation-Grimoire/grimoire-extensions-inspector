import { useState } from "react";
import { api, imgUrl, Novel, SourceMeta } from "../api";
import { useAsync, Spinner, ErrorBanner } from "../ui";

type Mode = "Popular" | "Latest" | "Search";

export function Browse({
  source,
  mode,
  onOpen,
}: {
  source: SourceMeta;
  mode: Mode;
  onOpen: (n: Novel) => void;
}) {
  const [query, setQuery] = useState("the");
  const [submitted, setSubmitted] = useState("the");

  const state = useAsync<Novel[]>(() => {
    if (mode === "Popular") return api.popular(source.id);
    if (mode === "Latest") return api.latest(source.id);
    return api.search(source.id, submitted);
  }, [source.id, mode, submitted]);

  return (
    <div>
      {mode === "Search" && (
        <div className="toolbar">
          <input
            value={query}
            placeholder="search query…"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setSubmitted(query)}
          />
          <button onClick={() => setSubmitted(query)}>Search</button>
        </div>
      )}
      {state.loading && <Spinner />}
      {state.error && <ErrorBanner msg={state.error} />}
      {state.data && <Grid list={state.data} sourceId={source.id} onOpen={onOpen} />}
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
  if (list.length === 0) return <div className="banner warn">empty — 0 novels returned</div>;
  return (
    <>
      <div className="muted small">{list.length} items</div>
      <div className="grid">
        {list.map((n, i) => (
          <Card key={`${n.url}-${i}`} n={n} sourceId={sourceId} onOpen={onOpen} />
        ))}
      </div>
    </>
  );
}

function Card({
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
    <div className={`card${noimg ? " noimg" : ""}`} onClick={() => onOpen(n)} title={n.title}>
      {n.thumbnailUrl && !broken && (
        <img loading="lazy" src={imgUrl(sourceId, n.thumbnailUrl)} onError={() => setBroken(true)} />
      )}
      <div className="t">{n.title || "(untitled)"}</div>
    </div>
  );
}
