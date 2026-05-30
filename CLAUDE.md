# CLAUDE.md — Agent guide for the Source Inspector

Headless test/debug harness for Grimoire extensions. Runs extension `Source`
code on a **plain JVM — no Android emulator, no Android SDK** — drives it the way
the app does, and reports a full list of errors/warnings. Read this before
editing; it complements [`README.md`](./README.md) with the gotchas.

## What it is

One shared engine, two front-ends:
- **CLI** (clikt) — `list` / `run` / `serve`, with `--json` for agents/CI.
- **Web app** (Ktor) — app-like browser + run-suite report at `localhost:8080`.

## Running it

**The extensions repo path is required every run** via `-Pext=<path>` (it is not
assumed to be a sibling). API + lib default to next-to / inside that path; the
build fails fast with guidance if `-Pext` is missing. You can instead set
`grimoireExtDir=…` in `gradle.properties` / `~/.gradle/gradle.properties` to
avoid retyping.

```bash
EXT=/path/to/grimoire-extensions   # the repo you want to test
# from the repo root; first run downloads Gradle 9.4.1 + deps
./gradlew -q run -Pext=$EXT --args="list"                    # sources + capabilities
./gradlew -q run -Pext=$EXT --args="list --json"
./gradlew -q run -Pext=$EXT --args="run --all --json"        # full suite, JSON (agents)
./gradlew -q run -Pext=$EXT --args="run --source novelfull"  # one source, human output
./gradlew -q run -Pext=$EXT --args="run --all --offline"     # no-network structural checks
./gradlew    serve -Pext=$EXT                                # web UI: build React app + serve (blocks)
./gradlew    serve -Pext=$EXT -Pport=9090                    # …on a custom port
./gradlew    listSourceDirs -Pext=$EXT                       # show exactly what got wired in
```

The `serve` task builds the React UI (`buildFrontend`, needs Node) and starts
the server; plain `run`/`list` never touch Node, so the CLI stays usable for
agents/CI without npm. `run --args="serve"` also works but serves the
last-built UI (no rebuild).

Optional path overrides (defaults derive from `-Pext`):
`-Papi=<grimoire-extensions-api>`, `-Plib=<lib-root>`,
`-PincludeX=true -Pextx=<grimoire-extensions-x>`. Point `-Pext` at any repo of
the same `src/{lang}/{name}` shape (e.g. a fork or the private R18 repo).

`run` flags: `--source <id|name|substr>`, `--lang <code>`, `--all`,
`--query <q>` (default "the"), `--timeout <sec>` (default 30), `--offline`,
`--json`, `--fail-on warn|error|never` (default `error`). **Exit code is
non-zero when there are ERROR diagnostics** — so `run` "failing" the Gradle task
is the expected signal that the suite found errors, not a build break.

For clean stdout (no Gradle log noise) when scraping JSON, build a launcher once:

```bash
./gradlew installDist -Pext=$EXT
./build/install/inspector/bin/inspector run --all --json
```

Web JSON API mirrors the CLI: `curl localhost:8080/api/sources`, plus per-source
`/popular`, `/latest`, `/search`, `/filters`, `/novel`, `/chapters`, `/pages`,
`/prefs`, `/login`, `/cookies`, a `/api/run` suite, and an `/img` proxy.

## How it works (the important part)

There is **no Android here**. The harness compiles the API, `lib/`, and every
extension's `src/main` Kotlin **from sibling checkouts** into one JVM classpath:

- Source roots are wired in `build.gradle.kts` via `sourceSets.main.java.srcDirs`
  from Gradle properties. `-Pext=<extensions-repo>` is **required** (no sibling
  default); `-Papi`/`-Plib` default to next-to / inside it; the build throws a
  guided error for source-hungry tasks when `-Pext` is missing. Add the private
  repo with `-PincludeX=true -Pextx=…`. Run `./gradlew listSourceDirs -Pext=…`
  to print exactly what got wired in.
- The only Android coupling in the API + extensions is a tiny bounded set
  (`CookieManager`, `Context`, `WebSettings`, `WebView`/`WebViewClient`,
  `Handler`/`Looper`, `@SuppressLint`, plus `org.json`). It is satisfied by
  hand-written stubs in `src/main/kotlin/stubs/` — a **real in-memory
  `CookieManager`** (so `WebViewCookieJar` round-trips cookies) and **compile-only**
  no-ops for the rest. `org.json` comes from the `org.json:json` artifact.
- Sources are discovered by scanning the `@SourceInfo` annotation with ClassGraph
  (`acceptPackages("io.grimoire.extension", "io.grimoire.extensions")` — never the
  bundled Tachiyomi `eu.kanade.*` tree) and instantiated via their no-arg ctor,
  exactly like the app.

**Hot reload** = edit any extension / `lib` / API `.kt` and re-run. Incremental
Kotlin compile picks it up; no APK, no install. Adding a new extension dir is
auto-discovered on the next run.

### Two deliberate headless limits
- `NetworkContext` is never `init`'d, so `NetworkContext.userAgent` falls back to
  its hardcoded UA and the Cloudflare WebView path is unreachable — a challenge
  throws `CloudflareException`, which the engine catches and reports as a
  `CLOUDFLARE_BLOCKED` **warning** (not a crash). Don't "fix" this by feeding a
  Context; it can't solve JS challenges headlessly anyway.
- Interactive WebView login can't run. The login panel reports state and accepts
  pasted session cookies (injected into the stub `CookieManager`).

## Layout

```
src/main/kotlin/stubs/                 android-stubs (one package per file)
src/main/kotlin/io/grimoire/inspector/
  Main.kt                              clikt CLI (list / run / serve)
  SourceDiscovery.kt                   @SourceInfo scan → DiscoveredSource list
  engine/
    SourceOps.kt                       per-source live ops (shared CLI + web)
    Inspector.kt                       the suite: stage pipeline + exception mapping
    Checks.kt                          validations (covers, empty lists, blank pages…)
    Report.kt                          @Serializable report DTOs + Severity
    Dto.kt                             wire DTOs for the API models + mappers
  web/Server.kt                        Ktor: JSON API + /img proxy + SPA host (index.html fallback)
frontend/                              React + TypeScript + Vite web UI (source of truth)
  src/api.ts                           typed client + DTO types (mirror engine/Dto.kt)
  src/main.tsx                         entry: <MantineProvider> + <BrowserRouter> + <App/>
  src/theme.ts                         Mantine theme (dark-only, indigo accent)
  src/App.tsx                          react-router route table (see "Routing" below)
  src/ui.tsx                           shared hooks (useAsync) + Mantine-backed widgets
  src/sources.tsx                      SourcesProvider context (sources fetched once, shared)
  src/components/                      Layout / SourceLayout / Home / Browse / NovelPage /
                                       ReaderPage / Filters / Config / Login / RunReport
build/frontend/                        Vite output (generated) — folded into the jar's web/
```

## Web UI (React + Vite)

The frontend lives in `frontend/` (React 18 + TS + `react-router-dom` v6 +
**Mantine v8** for components). Mantine owns the reset, dark theme, and all
widgets — `main.tsx` imports `@mantine/core/styles.css` and wraps the app in
`<MantineProvider theme={theme} forceColorScheme="dark">`; `src/theme.ts` holds
the theme; `postcss.config.cjs` wires `postcss-preset-mantine`. `src/styles.css`
is now near-empty (just full-height `html/body/#root`); do component styling with
Mantine props/`Stack`/`Group`, not bespoke CSS. Pass router `Link`s to Mantine
via `component={Link}` (or `renderRoot={(p) => <Link … {...p} />}` for
`Tabs.Tab`, whose props TS won't otherwise widen).
`buildFrontend` runs `npm install` + `vite build` → `build/frontend`, and
`processResources` folds that into the jar's `web/`, which `web/Server.kt` serves
via Ktor `singlePageApplication` (static files + `index.html` fallback for deep
routes). The `serve` Gradle task chains `buildFrontend` then starts the server;
it is the **only** path that needs Node — `run`/`list`/`compileKotlin` never
build the frontend, so the CLI stays Node-free.

### Routing

`BrowserRouter` with real URLs (no modals), so every view is bookmarkable and the
header shows breadcrumbs. Routes (`src/App.tsx`):
- `/` — home placeholder · `/run?source=<id|name>` — suite report (filterable)
- `/source/:id` — `SourceLayout` (head + tab nav + `<Outlet/>`; passes the
  `SourceMeta` to children via `useOutletContext`/`useCurrentSource`)
  - `popular` · `latest` · `search?q=<q>` · `filters` · `config` · `login`
  - `novel?u=<url>&t=<title>` — `NovelPage` (detail + chapters)
  - `read?u=<chapterUrl>&t=<name>&nu=<novelUrl>&nt=<novelTitle>` — `ReaderPage`
    (`nu`/`nt` let the reader + breadcrumb link back to the novel)
URL params carry the source-defined `url`/`query` strings; `vite.config.ts` uses
`base: "/"` so absolute `/assets/…` paths resolve on deep routes.

- **Editing the UI:** change files under `frontend/src`, then `./gradlew serve …`
  rebuilds the bundle. The JSON contract is `frontend/src/api.ts` ⇄
  `engine/Dto.kt` / `Report.kt` — keep them in sync when you add an endpoint.
- **Frontend hot reload (dev):** run the backend once
  (`./gradlew serve -Pext=…` or `run --args="serve"`) and in parallel
  `cd frontend && npm run dev`; open `http://localhost:5173` — Vite proxies
  `/api` and `/img` to `:8080` and hot-reloads the UI on save.
- The built bundle is generated, not committed (`build/` and
  `frontend/node_modules` are gitignored).

## Extending it

- **New validation** → add to `engine/Checks.kt` (returns `List<Diagnostic>` with
  a stable `code`) and call it from the relevant stage in `Inspector.kt`.
- **New suite stage** → add a `stage("name") { … StageOutcome(...) }` block in
  `Inspector.inspect`; network stages are skipped under `--offline`.
- **New API surface for the UI** → add a `SourceOps` method + a route in
  `web/Server.kt`; the API models aren't `@Serializable`, so map through a DTO in
  `engine/Dto.kt`.
- Keep diagnostic **severity honest**: ERROR = real breakage (empty list, all
  pages blank, parse exception, dup chapter URLs); WARN = degraded but usable
  (some empty covers, a few blank paragraphs, Cloudflare/login-gated).

## Don'ts

- **Don't pull the API/extensions in as `.aar`/published artifacts** — they drag
  Android. Compile them from source against the stubs (the current setup).
- **Don't add the Tachiyomi `extensions-source` checkout** to the source roots,
  and don't widen the ClassGraph `acceptPackages`.
- **Don't init `NetworkContext`** or try to make Cloudflare/WebView "work"
  headlessly — report it, don't solve it.
- **Don't treat a non-zero `run` exit as a build failure** — it means the suite
  found ERROR diagnostics. Use `--fail-on never` if you only want the report.
