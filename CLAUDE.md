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
assumed to be a sibling). The lib defaults to inside that path; the
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
./gradlew    dev   -Pext=$EXT                                # backend + Vite dev server, UI hot-reload @ :5173
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
`--query <q>` (default "world"), `--timeout <sec>` (default 30),
`--concurrency <n>` (parallel chapter-page fetches, default 1), `--offline`,
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
`/prefs`, `/login`, `/cookies` (GET reads / POST injects / DELETE clears the
in-memory cookie jar), a global `/api/ua` (GET/POST the User-Agent override), a
`/api/run` suite, and an `/img` proxy.

## How it works (the important part)

Inspector consumes the shared JVM `extensions-core` artifact. Compile only
`lib/` and extension source roots in `build.gradle.kts`; never compile API
sources into this host. `-Papi` / `-PgrimoireApiDir` optionally selects a local
API composite containing `core/`. Without it, the published artifact requires
GitHub Packages credentials. `extensionsCoreVersion` selects the artifact version.

`SourceDiscovery.discover()` installs `InspectorNetwork` before constructing
sources. Keep ClassGraph restricted to `io.grimoire.extension` and
`io.grimoire.extensions`; never scan the bundled Tachiyomi tree. Sources use the
same host `Source` class and singleton HTTP client. The host overrides UA through
`NetworkUa`, without reflection or Android `NetworkContext` mutation.

`InspectorNetwork.cookieJar` is ephemeral. OkHttp parses Set-Cookie and matches
host/domain, path, expiry and Secure. The stub `android.webkit.CookieManager`
bridges into that store for source calls and the web Cookies tab. It does not
run a browser. Other Android symbols are compile-only shims. The source-facing
`NetworkContext.context` shim always returns null and cannot be initialized.

### Headless limits

The core's shared challenge detector is used by the Inspector platform. A
challenge raises `CloudflareException`, which the suite reports as
`CLOUDFLARE_BLOCKED`. Ordinary origin errors remain ordinary HTTP responses.
Do not provide a Context or pretend the stubs can solve JavaScript challenges.
Interactive WebView login is unavailable. Pasted browser cookies can be paired
with a UA override through the existing web endpoints; device-bound challenges
can still reject them.

Run `clean test installDist -Pext=... -Papi=... --no-build-cache` for migration
validation. Clean when changing source checkout paths: incremental outputs can
otherwise retain or omit classes. `run --all --offline` tests structural source
behavior; it does not establish Android or live browser compatibility.

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
  - `popular` · `latest` · `search?q=<q>` · `filters` · `config` · `login` ·
    `cookies` (paste session/`cf_clearance` cookies — works for every source)
  - `novel?u=<url>&t=<title>` — `NovelPage` (detail + chapters)
  - `read?u=<chapterUrl>&t=<name>&nu=<novelUrl>&nt=<novelTitle>` — `ReaderPage`
    (`nu`/`nt` let the reader + breadcrumb link back to the novel)
URL params carry the source-defined `url`/`query` strings; `vite.config.ts` uses
`base: "/"` so absolute `/assets/…` paths resolve on deep routes.

- **UI hot reload (one command):** `./gradlew dev -Pext=…` runs the backend
  (`:8080`, serving `/api` + `/img`) **and** the Vite dev server together; open
  `http://localhost:5173` and edits under `frontend/src` hot-reload instantly
  (Vite proxies `/api` + `/img` to `:8080`). Ctrl+C stops both. Backend Kotlin
  changes still need a restart. `serve` is the build-once path (Ktor serves the
  static bundle, no HMR); use it to sanity-check the production bundle.
- **Editing the UI (build-once):** change files under `frontend/src`, then
  `./gradlew serve …` rebuilds the bundle. The JSON contract is
  `frontend/src/api.ts` ⇄ `engine/Dto.kt` / `Report.kt` — keep them in sync when
  you add an endpoint.
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
