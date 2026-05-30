import { Link, NavLink, Outlet, useOutletContext, useParams } from "react-router-dom";
import { SourceMeta } from "../api";
import { Badge, Spinner } from "../ui";
import { useSource, useSources } from "../sources";

const TABS = ["popular", "latest", "search", "filters", "config", "login"] as const;
const LABEL: Record<(typeof TABS)[number], string> = {
  popular: "Popular",
  latest: "Latest",
  search: "Search",
  filters: "Filters",
  config: "Config",
  login: "Login",
};

export function SourceLayout() {
  const { id } = useParams();
  const sources = useSources();
  const source = useSource(Number(id));

  if (!source) {
    if (sources.loading) return <Spinner />;
    return <div className="pad muted">Unknown source “{id}”.</div>;
  }

  // key on id so per-tab/page state resets when switching sources.
  return (
    <div className="sourceView" key={source.id}>
      <div className="sourceHead">
        <div className="row-between">
          <h2>{source.name}</h2>
          <Link className="btn" to={`/run?source=${source.id}`}>
            Run suite on this source
          </Link>
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
          <NavLink key={t} to={t} className={({ isActive }) => (isActive ? "active" : "")}>
            {LABEL[t]}
          </NavLink>
        ))}
      </nav>

      <div className="tabBody">
        <Outlet context={source} />
      </div>
    </div>
  );
}

/** Child pages read the current source from the outlet context. */
export function useCurrentSource(): SourceMeta {
  return useOutletContext<SourceMeta>();
}
