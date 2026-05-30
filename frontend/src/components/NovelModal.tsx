import { useState } from "react";
import { api, Chapter, imgUrl, Novel, Page, SourceMeta } from "../api";
import { useAsync, Spinner, ErrorBanner } from "../ui";

export function NovelModal({
  source,
  novel,
  onClose,
}: {
  source: SourceMeta;
  novel: Novel;
  onClose: () => void;
}) {
  const details = useAsync<Novel>(() => api.novel(source.id, novel.url), [source.id, novel.url]);
  const [reading, setReading] = useState<Chapter | null>(null);

  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modalCard">
        <button className="modalClose" onClick={onClose}>
          ×
        </button>
        {details.loading && <Spinner />}
        {details.error && <ErrorBanner msg={details.error} />}
        {details.data && !reading && (
          <Detail source={source} novel={details.data} onRead={setReading} />
        )}
        {reading && (
          <Reader source={source} chapter={reading} onBack={() => setReading(null)} />
        )}
      </div>
    </div>
  );
}

function Detail({
  source,
  novel,
  onRead,
}: {
  source: SourceMeta;
  novel: Novel;
  onRead: (c: Chapter) => void;
}) {
  const [showChapters, setShowChapters] = useState(false);
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
        <Chapters source={source} url={novel.url} onRead={onRead} />
      )}
    </div>
  );
}

function Chapters({
  source,
  url,
  onRead,
}: {
  source: SourceMeta;
  url: string;
  onRead: (c: Chapter) => void;
}) {
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

function Reader({
  source,
  chapter,
  onBack,
}: {
  source: SourceMeta;
  chapter: Chapter;
  onBack: () => void;
}) {
  const state = useAsync<Page[]>(() => api.pages(source.id, chapter.url), [source.id, chapter.url]);
  return (
    <div>
      <div className="toolbar">
        <button onClick={onBack}>← chapters</button>
        <strong>{chapter.name}</strong>
      </div>
      {state.loading && <Spinner label="loading pages…" />}
      {state.error && <ErrorBanner msg={state.error} />}
      {state.data && (
        <div className="reader">
          <div className="muted small">{state.data.length} pages</div>
          {state.data.map((p) => (
            <PageView key={p.index} page={p} sourceId={source.id} />
          ))}
        </div>
      )}
    </div>
  );
}

function PageView({ page, sourceId }: { page: Page; sourceId: number }) {
  if (page.imageUrl) return <img className="pageImg" src={imgUrl(sourceId, page.imageUrl)} />;
  if (page.formattedText)
    return <p dangerouslySetInnerHTML={{ __html: page.formattedText }} />;
  if (page.isSeparator) return <hr />;
  return <p>{page.text || <span className="err">⚠ empty page</span>}</p>;
}
