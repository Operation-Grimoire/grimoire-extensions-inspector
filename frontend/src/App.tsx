import { useMemo, useState } from "react";
import { api, SourceMeta } from "./api";
import { useAsync, Spinner, ErrorBanner } from "./ui";
import { SourceView } from "./components/SourceView";
import { RunReport } from "./components/RunReport";

export function App() {
  const sources = useAsync(() => api.sources(), []);
  const [currentId, setCurrentId] = useState<number>();
  const [filter, setFilter] = useState("");
  const [showReport, setShowReport] = useState(false);
  const [reportFilter, setReportFilter] = useState<string | undefined>();

  const list = sources.data ?? [];
  const current = useMemo(() => list.find((s) => s.id === currentId), [list, currentId]);

  const filtered = list.filter(
    (s) => !filter || s.name.toLowerCase().includes(filter.toLowerCase()) || s.lang.includes(filter),
  );

  const openReport = (sourceFilter?: string) => {
    setReportFilter(sourceFilter);
    setShowReport(true);
  };

  return (
    <div className="app">
      <header>
        <strong>Grimoire Source Inspector</strong>
        <span className="muted">{sources.loading ? "loading…" : `${list.length} sources`}</span>
        <span className="spacer" />
        <button className="primary" onClick={() => openReport(undefined)}>
          Run full suite
        </button>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <input
            placeholder="filter sources…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <ul className="sourceList">
            {filtered.map((s) => (
              <SourceRow
                key={s.id}
                s={s}
                active={s.id === currentId && !showReport}
                onClick={() => {
                  setCurrentId(s.id);
                  setShowReport(false);
                }}
              />
            ))}
          </ul>
        </aside>

        <main className="main">
          {sources.error && <ErrorBanner msg={sources.error} />}
          {showReport ? (
            <RunReport
              sourceFilter={reportFilter}
              onClose={() => setShowReport(false)}
              onJump={(id) => {
                setCurrentId(id);
                setShowReport(false);
              }}
            />
          ) : current ? (
            <SourceView source={current} onRunOne={() => openReport(String(current.id))} />
          ) : sources.loading ? (
            <Spinner />
          ) : (
            <div className="pad muted">
              Pick a source to browse it like the app, or “Run full suite” for the debugger report.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function SourceRow({ s, active, onClick }: { s: SourceMeta; active: boolean; onClick: () => void }) {
  return (
    <li className={active ? "active" : ""} onClick={onClick}>
      <div>
        {s.name} <span className="lang">{s.lang}</span>
      </div>
      <div className="caps">{s.capabilities.join(", ")}</div>
    </li>
  );
}
