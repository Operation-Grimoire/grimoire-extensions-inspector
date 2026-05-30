import { Fragment, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useSearchParams } from "react-router-dom";
import { SourceMeta } from "../api";
import { ErrorBanner } from "../ui";
import { useSources } from "../sources";

const TAB_LABELS: Record<string, string> = {
  popular: "Popular",
  latest: "Latest",
  search: "Search",
  filters: "Filters",
  config: "Config",
  login: "Login",
};

export function Layout() {
  const sources = useSources();
  const list = sources.data ?? [];

  return (
    <div className="app">
      <header>
        <Link to="/" className="brand">
          <strong>Grimoire Source Inspector</strong>
        </Link>
        <span className="muted">{sources.loading ? "loading…" : `${list.length} sources`}</span>
        <Breadcrumbs sources={list} />
        <span className="spacer" />
        <Link className="primary btn" to="/run">
          Run full suite
        </Link>
      </header>

      <div className="layout">
        <Sidebar sources={list} />
        <main className="main">
          {sources.error && <ErrorBanner msg={sources.error} />}
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function Sidebar({ sources }: { sources: SourceMeta[] }) {
  const [filter, setFilter] = useState("");
  const filtered = sources.filter(
    (s) => !filter || s.name.toLowerCase().includes(filter.toLowerCase()) || s.lang.includes(filter),
  );
  return (
    <aside className="sidebar">
      <input
        placeholder="filter sources…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <ul className="sourceList">
        {filtered.map((s) => (
          <li key={s.id}>
            <NavLink to={`/source/${s.id}`} className={({ isActive }) => (isActive ? "active" : "")}>
              <div>
                {s.name} <span className="lang">{s.lang}</span>
              </div>
              <div className="caps">{s.capabilities.join(", ")}</div>
            </NavLink>
          </li>
        ))}
      </ul>
    </aside>
  );
}

interface Crumb {
  label: string;
  to?: string;
}

function Breadcrumbs({ sources }: { sources: SourceMeta[] }) {
  const { pathname } = useLocation();
  const [sp] = useSearchParams();
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return null;

  const crumbs: Crumb[] = [{ label: "Sources", to: "/" }];

  if (parts[0] === "run") {
    crumbs.push({ label: "Run report" });
  } else if (parts[0] === "source") {
    const id = parts[1];
    const name = sources.find((s) => String(s.id) === id)?.name ?? `#${id}`;
    crumbs.push({ label: name, to: `/source/${id}/popular` });

    const sub = parts[2];
    if (sub && TAB_LABELS[sub]) {
      crumbs.push({ label: TAB_LABELS[sub] });
    } else if (sub === "novel") {
      crumbs.push({ label: sp.get("t") || "Novel" });
    } else if (sub === "read") {
      const nu = sp.get("nu");
      const nt = sp.get("nt") || "Novel";
      if (nu) {
        crumbs.push({
          label: nt,
          to: `/source/${id}/novel?u=${encodeURIComponent(nu)}&t=${encodeURIComponent(nt)}`,
        });
      }
      crumbs.push({ label: sp.get("t") || "Chapter" });
    }
  }

  return (
    <nav className="crumbs">
      {crumbs.map((c, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="sep">/</span>}
          {c.to ? <Link to={c.to}>{c.label}</Link> : <span>{c.label}</span>}
        </Fragment>
      ))}
    </nav>
  );
}
