# Grimoire Source Inspector

A headless test/debug harness for [Grimoire](https://github.com/Operation-Grimoire)
content-source extensions. It runs extension `Source` code on a plain JVM — **no
Android emulator, no Android SDK** — mimics how the app drives a source
(popular / latest / search / filters / details / chapters / reader / config /
login), and reports a full list of errors and warnings (empty covers, empty
lists, blank pages, parse exceptions, Cloudflare blocks, …).

It has two front-ends over one shared engine:

- a **CLI** with machine-readable JSON output (for agents / CI), and
- a **local web app** that is both an *app-like browser* and a *debugger report*.

## How it works

Inspector consumes `io.grimoire:extensions-core:1.4.1-SNAPSHOT`, the shared
JVM source API. It compiles only `lib/` and extension sources from checkouts,
discovers `@SourceInfo` with ClassGraph, and installs an explicit JVM HTTP
platform before constructing sources. The API's Android sources and AAR are
not on its classpath.

`InspectorNetwork` owns an ephemeral OkHttp cookie store and the process-wide
User-Agent override, and exposes that store through `SourceBrowserCookies`.
Extension code reads and expires cookies with `SourceCookies`. The
`CookieManager` compatibility bridge uses that same store, so pasted cookies
and source HTTP requests share domain/path/Secure and expiry rules. Other
Android stubs exist only for source compatibility. The `NetworkContext.context`
shim always returns null, and `SourceBrowser.ready` stays false; there is no
browser engine.

Cloudflare JS challenges can't be solved headlessly, so they're reported as a
`CLOUDFLARE_BLOCKED` warning rather than crashing.

## Which extensions to test

You pass the extensions repo path **every run** with `-Pext=<path>` — it is not
assumed to live anywhere in particular. The `lib/` path defaults to inside that checkout; override with `-Plib`.
For local API development, pass `-Papi` pointing to an API checkout containing
`core/`. Gradle substitutes the core artifact with that project; it never adds
API source roots to Inspector. Without `-Papi`, GitHub Packages credentials
(`GITHUB_ACTOR`, `GITHUB_TOKEN`) are required for the published core artifact.
Override its version with `-PextensionsCoreVersion=VERSION`. Point `-Pext` at
any repo of the same `src/{lang}/{name}` shape (the main repo, a fork, or the
private R18 repo). To avoid retyping, set `grimoireExtDir=…` in
`gradle.properties` or `~/.gradle/gradle.properties`.

## Usage

### CLI

```bash
EXT=/path/to/grimoire-extensions

# For local API development, optionally add -Papi=/path/to/grimoire-extensions-api.

# list discovered sources (+ capabilities)
./gradlew -q run -Pext=$EXT --args="list"
./gradlew -q run -Pext=$EXT --args="list --json"

# run the full suite (live network), JSON for agents
./gradlew -q run -Pext=$EXT --args="run --all --json"

# one source, human output
./gradlew -q run -Pext=$EXT --args="run --source novelfull"

# structural-only (no network): capabilities + filters + prefs
./gradlew -q run -Pext=$EXT --args="run --all --offline"
```

Flags: `--source <id|name>`, `--lang <code>`, `--query <q>`, `--timeout <sec>`,
`--offline`, `--json`, `--fail-on warn|error|never`. Exit code is non-zero when
there are ERROR diagnostics (CI-friendly). Path overrides: `-Papi`, `-Plib`,
`-PincludeX=true -Pextx=…`.

For clean stdout (no Gradle noise), build a launcher once and call it directly:

```bash
./gradlew installDist -Pext=$EXT
./build/install/inspector/bin/inspector run --all --json
```

### Web app

A React + Vite UI (in `frontend/`), bundled into the server.

```bash
./gradlew serve -Pext=$EXT            # builds the UI (needs Node) + serves
# open http://localhost:8080          # custom port: -Pport=9090
```

Browse a source like the app (cover grids via an image proxy, novel → chapters →
reader, filter sheet, config + cookie-injection login panels), or click **Run
full suite** for the pass/warn/fail report. The same JSON the UI uses is on
`/api/*` (e.g. `curl localhost:8080/api/sources`). The `serve` task is the only
one that needs Node — `run`/`list` stay Node-free for agents/CI.

**Frontend dev (hot reload):** run the backend (`./gradlew serve -Pext=$EXT`)
and, in parallel, `cd frontend && npm run dev`; open `http://localhost:5173` —
Vite proxies the API and hot-reloads on save.

## Hot reload

- **Frontend:** `npm run dev` (above) — instant.
- **Extension / lib / local composite core code:** edit and re-run; incremental Kotlin compile
  picks it up (no APK, no install). The running server doesn't swap classes —
  restart `serve` to pick up source edits.

## Shared-runtime verification

```sh
./gradlew clean test installDist -Pext=/path/to/grimoire-extensions --no-build-cache
./build/install/inspector/bin/inspector run --all --offline --json
```

Use `clean` when switching extension checkout paths to avoid stale incremental
compiler outputs. Tests verify single-copy core ownership, real source discovery,
cookie isolation, HTTP sharing, dynamic UA changes and challenge reporting.
See [local migration validation](docs/shared-runtime-validation.md) for the
current evidence and publication boundary.

The JVM CI workflow runs these deterministic tests against the stable published
core with a minimal extension directory and controlled test-only discovery
fixtures. It requires no API checkout or Android SDK. Real extension compilation,
offline suites and live source compatibility remain separate integration checks.
