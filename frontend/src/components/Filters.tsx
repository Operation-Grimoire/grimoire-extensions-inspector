import { useState } from "react";
import { api, FilterDto } from "../api";
import { useAsync, Spinner, ErrorBanner } from "../ui";
import { useCurrentSource } from "./SourceLayout";

export function Filters() {
  const source = useCurrentSource();
  const [fetchDynamic, setFetchDynamic] = useState(false);
  const state = useAsync<FilterDto[]>(
    () => api.filters(source.id, fetchDynamic),
    [source.id, fetchDynamic],
  );

  return (
    <div>
      <div className="toolbar">
        {source.hasDynamicFilters && (
          <button onClick={() => setFetchDynamic(true)} disabled={fetchDynamic}>
            {fetchDynamic ? "fetched" : "Fetch dynamic options"}
          </button>
        )}
        <span className="muted small">
          {source.hasDynamicFilters ? "this source loads some options over the network" : ""}
        </span>
      </div>
      {state.loading && <Spinner />}
      {state.error && <ErrorBanner msg={state.error} />}
      {state.data && <FilterList filters={state.data} />}
    </div>
  );
}

function FilterList({ filters }: { filters: FilterDto[] }) {
  if (filters.length === 0) return <div className="muted">no filters</div>;
  return (
    <div className="filters">
      {filters.map((f, i) => (
        <FilterRow key={i} f={f} />
      ))}
    </div>
  );
}

function FilterRow({ f }: { f: FilterDto }) {
  return (
    <div className="row">
      <div>
        <strong>{f.name || "(unnamed)"}</strong> <span className="muted small">{f.type}</span>
        {f.values.length > 0 && (
          <div className="muted small">[{f.values.join(", ")}]</div>
        )}
        {f.children.length > 0 && (
          <div className="muted small">{f.children.length} options</div>
        )}
      </div>
    </div>
  );
}
