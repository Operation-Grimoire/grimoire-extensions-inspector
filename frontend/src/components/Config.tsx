import { useEffect, useState } from "react";
import { api, PrefDto } from "../api";
import { useAsync, Spinner, ErrorBanner, errMsg } from "../ui";
import { useCurrentSource } from "./SourceLayout";

export function Config() {
  const source = useCurrentSource();
  const state = useAsync<PrefDto[]>(() => api.prefs(source.id), [source.id]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string>();

  useEffect(() => {
    if (state.data) {
      const init: Record<string, string> = {};
      state.data.forEach((p) => (init[p.key] = p.default));
      setValues(init);
    }
  }, [state.data]);

  if (state.loading) return <Spinner />;
  if (state.error) return <ErrorBanner msg={state.error} />;
  const prefs = state.data ?? [];
  if (prefs.length === 0)
    return <div className="muted pad">this source has no configurable preferences</div>;

  const apply = async () => {
    try {
      await api.setPrefs(source.id, values);
      setStatus("applied ✓");
    } catch (e) {
      setStatus(errMsg(e));
    }
  };

  return (
    <div>
      {prefs.map((p) => (
        <div className="row pref" key={p.key}>
          <div>
            <strong>{p.title}</strong>
            <div className="muted small">{p.summary || p.key}</div>
          </div>
          {p.type === "switch" ? (
            <input
              type="checkbox"
              checked={values[p.key] === "true"}
              onChange={(e) => setValues((v) => ({ ...v, [p.key]: String(e.target.checked) }))}
            />
          ) : (
            <input
              type={p.isPassword ? "password" : "text"}
              placeholder={p.default}
              value={values[p.key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [p.key]: e.target.value }))}
            />
          )}
        </div>
      ))}
      <div className="toolbar">
        <button onClick={apply}>Apply preferences</button>
        {status && <span className="muted small">{status}</span>}
      </div>
    </div>
  );
}
