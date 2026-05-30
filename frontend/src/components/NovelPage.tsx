import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
    <div>
      <h2>{novel.title || "(untitled)"}</h2>
      <div className="muted">
        {[novel.author, novel.status, novel.genres.join(", ")].filter(Boolean).join(" · ")}
      </div>
      {novel.thumbnailUrl ? (
        <img className="cover" src={imgUrl(source.id, novel.thumbnailUrl)} />
      ) : (
        <div className="banner warn">empty thumbnailUrl</div>
      )}
      <p className="desc">{novel.description || "(no description)"}</p>
      {!showChapters ? (
        <button onClick={() => setShowChapters(true)}>Load chapters</button>
      ) : (
        <Chapters url={novel.url} onRead={read} />
      )}
    </div>
  );
}

function Chapters({ url, onRead }: { url: string; onRead: (c: Chapter) => void }) {
  const source = useCurrentSource();
  const state = useAsync<Chapter[]>(() => api.chapters(source.id, url), [source.id, url]);
  if (state.loading) return <Spinner label="loading chapters…" />;
  if (state.error) return <ErrorBanner msg={state.error} />;
  const list = state.data ?? [];
  return (
    <div className="chapters">
      <div className="muted small">{list.length} chapters</div>
      {list.map((c, i) => (
        <div
          key={`${c.url}-${i}`}
          className={`row${c.locked ? " locked-row" : ""}`}
          onClick={() => !c.locked && onRead(c)}
        >
          <span>{c.name || "(unnamed)"}</span>
          {c.locked && <span className="locked">locked</span>}
        </div>
      ))}
    </div>
  );
}
