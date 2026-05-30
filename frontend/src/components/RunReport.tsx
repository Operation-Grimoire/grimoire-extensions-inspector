import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, Diagnostic, RunReport as Report, SourceReport, StageResult } from "../api";
import { useAsync, Spinner, ErrorBanner } from "../ui";

export function RunReport() {
  const [sp] = useSearchParams();
  const sourceFilter = sp.get("source") ?? undefined;
  const state = useAsync<Report>(() => api.run(sourceFilter), [sourceFilter]);

  return (
    <div className="report">
      <div className="toolbar">
        {state.data && (
          <span>
            {state.data.totals.sources} sources ·{" "}
            <span className="err">{state.data.totals.errors} errors</span> ·{" "}
            <span className="warn">{state.data.totals.warnings} warnings</span> ·{" "}
            {state.data.durationMs}ms
          </span>
        )}
      </div>
      {state.loading && <Spinner label="running suite (live network)…" />}
      {state.error && <ErrorBanner msg={state.error} />}
      {state.data?.sources.map((sr) => (
        <SourceCard key={sr.source.id} sr={sr} />
      ))}
    </div>
  );
}

function SourceCard({ sr }: { sr: SourceReport }) {
  return (
    <div className="srcReport">
      <div className="h">
        <span className={`dot ${sr.ok ? "ok" : "error"}`} />
        <strong>
          {sr.source.name} <span className="muted">({sr.source.lang})</span>
        </strong>
        <span className="muted small">
          errors={sr.errors} warnings={sr.warnings}
        </span>
        <span className="spacer" />
        <Link className="link" to={`/source/${sr.source.id}/popular`}>
          browse →
        </Link>
      </div>
      {sr.stages.map((st) => (
        <StageRow key={st.stage} st={st} />
      ))}
    </div>
  );
}

function StageRow({ st }: { st: StageResult }) {
  const [open, setOpen] = useState(st.status === "error" || st.status === "warn");
  const counts = Object.entries(st.counts)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  return (
    <div className="stage">
      <div className="h" onClick={() => setOpen((o) => !o)}>
        <span className={`dot ${st.status}`} />
        <strong>{st.stage}</strong>
        <span className="muted small">
          {st.status} {counts}
        </span>
      </div>
      {open && st.diagnostics.length > 0 && (
        <div className="diags">
          {st.diagnostics.map((d, i) => (
            <DiagRow key={i} d={d} />
          ))}
        </div>
      )}
    </div>
  );
}

function DiagRow({ d }: { d: Diagnostic }) {
  const cls = d.severity === "ERROR" ? "err" : d.severity === "WARN" ? "warn" : "info";
  return (
    <div className={cls}>
      {d.severity} {d.code}: {d.message}
      {d.samples.length > 0 && (
        <span className="muted small"> — {d.samples.slice(0, 3).join(", ")}</span>
      )}
    </div>
  );
}
