"use strict";

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  Object.assign(e, props);
  for (const k of kids) e.append(k);
  return e;
};
const esc = (s) => (s == null ? "" : String(s));

let SOURCES = [];
let current = null; // current source meta
const TABS = ["Popular", "Latest", "Search", "Filters", "Config", "Login"];

// ---- API helpers ------------------------------------------------------------
async function jget(path) {
  const r = await fetch(path);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw body;
  return body;
}
async function jpost(path, payload) {
  const r = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw body;
  return body;
}
const imgUrl = (url) => `/img?source=${current.id}&url=${encodeURIComponent(url)}`;

function errBox(e) {
  const msg = e && e.error ? `${e.code || "ERROR"}: ${e.error}` : String(e);
  return el("div", { className: "err pad" }, "⚠ " + msg);
}

// ---- Source list ------------------------------------------------------------
async function loadSources() {
  $("status").textContent = "loading sources…";
  SOURCES = await jget("/api/sources");
  $("status").textContent = `${SOURCES.length} sources`;
  renderSourceList();
}
function renderSourceList() {
  const q = $("filterSources").value.toLowerCase();
  const ul = $("sourceList");
  ul.innerHTML = "";
  SOURCES.filter((s) => !q || s.name.toLowerCase().includes(q) || s.lang.includes(q)).forEach((s) => {
    const li = el(
      "li",
      { onclick: () => selectSource(s) },
      el("div", {}, `${s.name} `, el("span", { className: "lang", textContent: s.lang })),
      el("div", { className: "caps", textContent: s.capabilities.join(", ") })
    );
    li.dataset.id = s.id;
    if (current && current.id === s.id) li.classList.add("active");
    ul.append(li);
  });
}

function selectSource(s) {
  current = s;
  renderSourceList();
  $("welcome").hidden = true;
  $("reportView").hidden = true;
  $("sourceView").hidden = false;
  const head = $("sourceHead");
  head.innerHTML = "";
  head.append(
    el("h2", { textContent: s.name }),
    el("div", { className: "muted", textContent: `${s.lang} · ${s.baseUrl} · v${s.versionCode}` }),
    el(
      "div",
      {},
      ...s.capabilities.map((c) => el("span", { className: "badge", textContent: c })),
      s.hasDynamicFilters ? el("span", { className: "badge", textContent: "dynamicFilters" }) : ""
    )
  );
  renderTabs("Popular");
}

function renderTabs(active) {
  const nav = $("tabs");
  nav.innerHTML = "";
  TABS.forEach((t) => {
    const b = el("button", { textContent: t, onclick: () => openTab(t) });
    if (t === active) b.classList.add("active");
    nav.append(b);
  });
  openTab(active);
}

async function openTab(tab) {
  [...$("tabs").children].forEach((b) => b.classList.toggle("active", b.textContent === tab));
  const body = $("tabBody");
  body.innerHTML = "loading…";
  try {
    if (tab === "Popular") return renderGrid(body, await jget(`/api/sources/${current.id}/popular?page=1`));
    if (tab === "Latest") return renderGrid(body, await jget(`/api/sources/${current.id}/latest?page=1`));
    if (tab === "Search") return renderSearch(body);
    if (tab === "Filters") return renderFilters(body);
    if (tab === "Config") return renderConfig(body);
    if (tab === "Login") return renderLogin(body);
  } catch (e) {
    body.innerHTML = "";
    body.append(errBox(e));
  }
}

// ---- Browse -----------------------------------------------------------------
function novelCard(n) {
  const card = el("div", { className: "card" });
  const img = el("img", { loading: "lazy", src: n.thumbnailUrl ? imgUrl(n.thumbnailUrl) : "" });
  img.onerror = () => card.classList.add("noimg");
  if (!n.thumbnailUrl) card.classList.add("noimg");
  card.append(img, el("div", { className: "t", textContent: n.title || "(untitled)" }));
  card.onclick = () => openNovel(n);
  return card;
}
function renderGrid(body, list) {
  body.innerHTML = "";
  if (!list.length) return body.append(el("div", { className: "warn" }, "empty list — 0 novels"));
  const grid = el("div", { className: "grid" });
  list.forEach((n) => grid.append(novelCard(n)));
  body.append(el("div", { className: "muted", textContent: `${list.length} items` }), grid);
}

function renderSearch(body) {
  body.innerHTML = "";
  const input = el("input", { placeholder: "search query…", value: "the" });
  const out = el("div", {});
  const go = async () => {
    out.innerHTML = "searching…";
    try {
      const list = await jpost(`/api/sources/${current.id}/search`, { query: input.value, page: 1 });
      out.innerHTML = "";
      renderGrid(out, list);
    } catch (e) {
      out.innerHTML = "";
      out.append(errBox(e));
    }
  };
  input.onkeydown = (e) => e.key === "Enter" && go();
  body.append(el("div", { className: "toolbar" }, input, el("button", { textContent: "Search", onclick: go })), out);
}

async function renderFilters(body) {
  const draw = async (fetch) => {
    body.innerHTML = "loading filters…";
    const filters = await jget(`/api/sources/${current.id}/filters${fetch ? "?fetch=true" : ""}`);
    body.innerHTML = "";
    const tb = el("div", { className: "toolbar" });
    if (current.hasDynamicFilters) tb.append(el("button", { textContent: "Fetch dynamic options", onclick: () => draw(true) }));
    body.append(tb);
    filters.forEach((f) => {
      const line = el("div", { className: "row" },
        el("strong", { textContent: f.name || "(unnamed)" }),
        el("span", { className: "muted", textContent: ` ${f.type}` }));
      if (f.values && f.values.length) line.append(el("span", { className: "muted", textContent: " [" + f.values.join(", ") + "]" }));
      if (f.children && f.children.length) line.append(el("span", { className: "muted", textContent: ` (${f.children.length} options)` }));
      body.append(line);
    });
    if (!filters.length) body.append(el("div", { className: "muted" }, "no filters"));
  };
  await draw(false);
}

async function renderConfig(body) {
  const prefs = await jget(`/api/sources/${current.id}/prefs`);
  body.innerHTML = "";
  if (!prefs.length) return body.append(el("div", { className: "muted" }, "this source has no configurable preferences"));
  const inputs = {};
  prefs.forEach((p) => {
    const input = p.type === "switch"
      ? el("input", { type: "checkbox", checked: p.default === "true" })
      : el("input", { type: p.isPassword ? "password" : "text", placeholder: p.default });
    inputs[p.key] = () => (p.type === "switch" ? String(input.checked) : input.value);
    body.append(el("div", { className: "row" },
      el("div", {}, el("strong", { textContent: p.title }), el("div", { className: "muted", textContent: p.summary || p.key })), input));
  });
  const save = el("button", { textContent: "Apply preferences", onclick: async () => {
    const values = {};
    Object.entries(inputs).forEach(([k, get]) => (values[k] = get()));
    await jpost(`/api/sources/${current.id}/prefs`, { values });
    save.textContent = "Applied ✓";
  }});
  body.append(el("div", { className: "toolbar" }, save));
}

async function renderLogin(body) {
  const info = await jget(`/api/sources/${current.id}/login`);
  body.innerHTML = "";
  if (info.loginUrl == null && info.isLoggedIn == null)
    return body.append(el("div", { className: "muted" }, "this source has no WebView login"));
  body.append(
    el("div", { className: "row" }, `loginUrl: ${esc(info.loginUrl)}`),
    el("div", { className: "row" }, `isLoggedIn: `, el("span", { className: info.isLoggedIn ? "ok" : "warn", textContent: String(info.isLoggedIn) })),
    el("div", { className: "muted pad" }, "Headless can't run the interactive WebView login. Paste session cookies (name=value; name2=value2) captured from a browser to exercise login-gated calls:")
  );
  const ta = el("textarea", { rows: 3, style: "width:100%", placeholder: "cf_clearance=…; sessionid=…" });
  const apply = el("button", { textContent: "Inject cookies", onclick: async () => {
    await jpost(`/api/sources/${current.id}/cookies`, { cookies: ta.value });
    apply.textContent = "Injected ✓";
  }});
  body.append(ta, el("div", { className: "toolbar" }, apply));
}

// ---- Novel → chapters → reader (modal) --------------------------------------
async function openNovel(n) {
  showModal("loading…");
  try {
    const d = await jpost(`/api/sources/${current.id}/novel`, { url: n.url });
    const box = el("div", {});
    box.append(
      el("h2", { textContent: d.title || n.title || "(untitled)" }),
      el("div", { className: "muted", textContent: `${esc(d.author)} · ${d.status} · ${(d.genres || []).join(", ")}` }),
    );
    if (d.thumbnailUrl) box.append(el("img", { src: imgUrl(d.thumbnailUrl), style: "max-height:220px;border-radius:8px;margin:8px 0" }));
    if (!d.thumbnailUrl) box.append(el("div", { className: "warn" }, "⚠ empty thumbnailUrl"));
    box.append(el("p", { textContent: d.description || "(no description)" }));
    const chaptersBox = el("div", {});
    box.append(el("button", { textContent: "Load chapters", onclick: () => loadChapters(d.url || n.url, chaptersBox) }), chaptersBox);
    showModal(box);
  } catch (e) {
    showModal(errBox(e));
  }
}
async function loadChapters(url, box) {
  box.innerHTML = "loading chapters…";
  try {
    const chs = await jpost(`/api/sources/${current.id}/chapters`, { url });
    box.innerHTML = "";
    box.append(el("div", { className: "muted", textContent: `${chs.length} chapters` }));
    chs.forEach((c) => {
      const row = el("div", { className: "row" }, el("span", { textContent: c.name || "(unnamed)" }));
      if (c.locked) row.append(el("span", { className: "locked", textContent: "locked" }));
      else row.onclick = () => openReader(c);
      box.append(row);
    });
  } catch (e) {
    box.innerHTML = "";
    box.append(errBox(e));
  }
}
async function openReader(c) {
  showModal("loading pages…");
  try {
    const pages = await jpost(`/api/sources/${current.id}/pages`, { url: c.url });
    const box = el("div", {});
    box.append(el("h3", { textContent: c.name }), el("div", { className: "muted", textContent: `${pages.length} pages` }));
    const reader = el("div", { className: "reader" });
    pages.forEach((p) => {
      if (p.imageUrl) reader.append(el("img", { src: imgUrl(p.imageUrl), style: "max-width:100%" }));
      else if (p.formattedText) { const d = el("p"); d.innerHTML = p.formattedText; reader.append(d); }
      else reader.append(el("p", { textContent: p.text }));
    });
    box.append(reader);
    showModal(box);
  } catch (e) {
    showModal(errBox(e));
  }
}

// ---- Modal ------------------------------------------------------------------
function showModal(content) {
  const b = $("modalBody");
  b.innerHTML = "";
  b.append(typeof content === "string" ? document.createTextNode(content) : content);
  $("modal").hidden = false;
}
$("modalClose").onclick = () => ($("modal").hidden = true);
$("modal").onclick = (e) => { if (e.target.id === "modal") $("modal").hidden = true; };

// ---- Run report -------------------------------------------------------------
async function runSuite(sourceFilter) {
  $("welcome").hidden = true;
  $("sourceView").hidden = true;
  $("reportView").hidden = false;
  $("reportSummary").textContent = "running…";
  $("reportBody").innerHTML = "";
  try {
    const rep = await jpost("/api/run", sourceFilter ? { source: String(sourceFilter) } : {});
    $("reportSummary").innerHTML = `${rep.totals.sources} sources · <span class="err">${rep.totals.errors} errors</span> · <span class="warn">${rep.totals.warnings} warnings</span> · ${rep.durationMs}ms`;
    const body = $("reportBody");
    rep.sources.forEach((sr) => {
      const card = el("div", { className: "srcReport" });
      card.append(el("div", { className: "h" },
        el("span", { className: "dot " + (sr.ok ? "ok" : "error") }),
        el("span", { textContent: `${sr.source.name} (${sr.source.lang})` }),
        el("span", { className: "muted", textContent: `errors=${sr.errors} warnings=${sr.warnings}` })));
      sr.stages.forEach((st) => {
        const stage = el("div", { className: "stage" });
        const diags = el("div", { className: "diags" });
        st.diagnostics.forEach((d) =>
          diags.append(el("div", { className: d.severity.toLowerCase() === "error" ? "err" : d.severity.toLowerCase() === "warn" ? "warn" : "info",
            textContent: `${d.severity} ${d.code}: ${d.message}` })));
        diags.hidden = true;
        const counts = Object.entries(st.counts || {}).map(([k, v]) => `${k}=${v}`).join(" ");
        const h = el("div", { className: "h" },
          el("span", { className: "dot " + st.status }),
          el("strong", { textContent: st.stage }),
          el("span", { className: "muted", textContent: `${st.status} ${counts}` }));
        h.onclick = () => (diags.hidden = !diags.hidden);
        stage.append(h, diags);
        card.append(stage);
      });
      body.append(card);
    });
  } catch (e) {
    $("reportSummary").textContent = "";
    $("reportBody").append(errBox(e));
  }
}

// ---- Wire up ----------------------------------------------------------------
$("filterSources").oninput = renderSourceList;
$("runAllBtn").onclick = () => runSuite(null);
$("closeReport").onclick = () => { $("reportView").hidden = true; if (current) $("sourceView").hidden = false; else $("welcome").hidden = false; };
loadSources().catch((e) => ($("status").textContent = "error: " + (e.error || e)));
