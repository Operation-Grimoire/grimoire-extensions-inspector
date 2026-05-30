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

Extensions are normal Kotlin (`HttpSource` → OkHttp, `ParsedHttpSource` →
Jsoup). The only Android coupling in the API + extensions is a tiny, bounded set
of symbols (`android.webkit.CookieManager`, `Context`, `WebSettings`,
`WebView`, `Handler`/`Looper`, `@SuppressLint`, plus `org.json`). This project
supplies minimal **android-stubs** (`src/main/kotlin/stubs/`) — a real in-memory
`CookieManager` and compile-only stubs for the rest — then compiles the API,
`lib/`, and every extension's `src/main` **from the sibling checkouts** into one
JVM classpath, discovers sources by scanning the `@SourceInfo` annotation, and
runs them live.

Cloudflare JS challenges can't be solved headlessly, so they're reported as a
`CLOUDFLARE_BLOCKED` warning rather than crashing.

## Layout expected on disk

The sibling Grimoire repos must be checked out next to this one (override with
`-P` flags otherwise):

```
<parent>/
  grimoire-extensions-inspector/   (this repo)
  grimoire-extensions-api/         -PgrimoireApiDir=…
  grimoire-extensions/             -PgrimoireExtDir=…
  grimoire-extensions-x/           optional: -PgrimoireIncludeX=true -PgrimoireExtXDir=…
```

## Usage

### CLI

```bash
# list discovered sources (+ capabilities)
./gradlew -q run --args="list"
./gradlew -q run --args="list --json"

# run the full suite (live network), JSON for agents
./gradlew -q run --args="run --all --json"

# one source, human output
./gradlew -q run --args="run --source novelfull"

# structural-only (no network): capabilities + filters + prefs
./gradlew -q run --args="run --all --offline"
```

Flags: `--source <id|name>`, `--lang <code>`, `--query <q>`, `--timeout <sec>`,
`--offline`, `--json`, `--fail-on warn|error|never`. Exit code is non-zero when
there are ERROR diagnostics (CI-friendly).

For clean stdout (no Gradle noise), build a launcher once and call it directly:

```bash
./gradlew installDist
./build/install/inspector/bin/inspector run --all --json
```

### Web app

```bash
./gradlew run --args="serve --port 8080"
# open http://localhost:8080
```

Browse a source like the app (cover grids via an image proxy, novel → chapters →
reader, filter sheet, config + cookie-injection login panels), or click **Run
full suite** for the pass/warn/fail report. The same JSON the UI uses is on
`/api/*` (e.g. `curl localhost:8080/api/sources`).

## Hot reload

Edit any extension / `lib` / API source and re-run — incremental Kotlin compile
picks it up. No APK build, no install.
