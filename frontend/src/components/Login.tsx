import { useState } from "react";
import { api, LoginDto, SourceMeta } from "../api";
import { useAsync, Spinner, ErrorBanner, errMsg } from "../ui";

export function Login({ source }: { source: SourceMeta }) {
  const state = useAsync<LoginDto>(() => api.login(source.id), [source.id]);
  const [cookies, setCookies] = useState("");
  const [status, setStatus] = useState<string>();

  if (state.loading) return <Spinner />;
  if (state.error) return <ErrorBanner msg={state.error} />;
  const info = state.data;
  if (!info || (info.loginUrl == null && info.isLoggedIn == null))
    return <div className="muted pad">this source has no WebView login</div>;

  const inject = async () => {
    try {
      await api.cookies(source.id, cookies);
      setStatus("injected ✓ — re-open a tab to use the session");
    } catch (e) {
      setStatus(errMsg(e));
    }
  };

  return (
    <div className="login">
      <div className="row">
        loginUrl:&nbsp;
        {info.loginUrl ? (
          <a href={info.loginUrl} target="_blank" rel="noreferrer">
            {info.loginUrl}
          </a>
        ) : (
          "—"
        )}
      </div>
      <div className="row">
        isLoggedIn:&nbsp;
        <span className={info.isLoggedIn ? "ok" : "warn"}>{String(info.isLoggedIn)}</span>
      </div>
      <p className="muted small pad">
        Headless can’t run the interactive WebView login. Paste session cookies captured from a
        browser (<code>name=value; name2=value2</code>) to exercise login-gated calls:
      </p>
      <textarea
        rows={3}
        placeholder="cf_clearance=…; sessionid=…"
        value={cookies}
        onChange={(e) => setCookies(e.target.value)}
      />
      <div className="toolbar">
        <button onClick={inject} disabled={!cookies.trim()}>
          Inject cookies
        </button>
        {status && <span className="muted small">{status}</span>}
      </div>
    </div>
  );
}
