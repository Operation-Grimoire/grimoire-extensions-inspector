import { useState } from "react";
import { Novel, SourceMeta } from "../api";
import { Badge } from "../ui";
import { Browse } from "./Browse";
import { Filters } from "./Filters";
import { Config } from "./Config";
import { Login } from "./Login";
import { NovelModal } from "./NovelModal";

type Tab = "Popular" | "Latest" | "Search" | "Filters" | "Config" | "Login";

const TABS: Tab[] = ["Popular", "Latest", "Search", "Filters", "Config", "Login"];

export function SourceView({ source, onRunOne }: { source: SourceMeta; onRunOne: () => void }) {
  const [tab, setTab] = useState<Tab>("Popular");
  const [novel, setNovel] = useState<Novel | null>(null);

  // Reset to Popular whenever the source changes.
  const key = source.id;

  return (
    <div className="sourceView" key={key}>
      <div className="sourceHead">
        <div className="row-between">
          <h2>{source.name}</h2>
          <button onClick={onRunOne}>Run suite on this source</button>
        </div>
        <div className="muted">
          {source.lang} · {source.baseUrl} · v{source.versionCode}
        </div>
        <div className="badges">
          {source.capabilities.map((c) => (
            <Badge key={c}>{c}</Badge>
          ))}
          {source.hasDynamicFilters && <Badge>dynamicFilters</Badge>}
        </div>
      </div>

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t} className={t === tab ? "active" : ""} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>

      <div className="tabBody">
        {(tab === "Popular" || tab === "Latest" || tab === "Search") && (
          <Browse source={source} mode={tab} onOpen={setNovel} />
        )}
        {tab === "Filters" && <Filters source={source} />}
        {tab === "Config" && <Config source={source} />}
        {tab === "Login" && <Login source={source} />}
      </div>

      {novel && <NovelModal source={source} novel={novel} onClose={() => setNovel(null)} />}
    </div>
  );
}
