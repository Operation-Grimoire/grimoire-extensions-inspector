import { Link, useSearchParams } from "react-router-dom";
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
    <div>
      <div className="toolbar">
        <Link className="btn" to={backTo}>
          ← chapters
        </Link>
        <strong>{name}</strong>
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
  if (page.formattedText) return <p dangerouslySetInnerHTML={{ __html: page.formattedText }} />;
  if (page.isSeparator) return <hr />;
  return <p>{page.text || <span className="err">⚠ empty page</span>}</p>;
}
