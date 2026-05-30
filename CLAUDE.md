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

```bash
# from the repo root; first run downloads Gradle 9.4.1 + deps
./gradlew -q run --args="list"                       # discovered sources + capabilities
./gradlew -q run --args="list --json"
./gradlew -q run --args="run --all --json"           # full suite, JSON report (agents)
./gradlew -q run --args="run --source novelfull"     # one source, human output
./gradlew -q run --args="run --all --offline"        # no-network structural checks only
./gradlew    run --args="serve --port 8080"          # web UI (blocks)
```

`run` flags: `--source <id|name|substr>`, `--lang <code>`, `--all`,
`--query <q>` (default "the"), `--timeout <sec>` (default 30), `--offline`,
`--json`, `--fail-on warn|error|never` (default `error`). **Exit code is
non-zero when there are ERROR diagnostics** — so `run` "failing" the Gradle task
is the expected signal that the suite found errors, not a build break.

For clean stdout (no Gradle log noise) when scraping JSON, build a launcher once:

```bash
./gradlew installDist
./build/install/inspector/bin/inspector run --all --json
```

Web JSON API mirrors the CLI: `curl localhost:8080/api/sources`, plus per-source
`/popular`, `/latest`, `/search`, `/filters`, `/novel`, `/chapters`, `/pages`,
`/prefs`, `/login`, `/cookies`, a `/api/run` suite, and an `/img` proxy.

## How it works (the important part)

There is **no Android here**. The harness compiles the API, `lib/`, and every
extension's `src/main` Kotlin **from sibling checkouts** into one JVM classpath:

- Source roots are wired in `build.gradle.kts` via `sourceSets.main.java.srcDirs`
  from Gradle properties — defaults assume repos are side-by-side:
  `-PgrimoireApiDir=../grimoire-extensions-api`, `-PgrimoireExtDir=../grimoire-extensions`.
  Add the private repo with `-PgrimoireIncludeX=true -PgrimoireExtXDir=…`.
  Run `./gradlew listSourceDirs` to print exactly what got wired in.
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
  web/Server.kt                        Ktor: JSON API + /img proxy + static SPA
src/main/resources/web/                vanilla-JS frontend (index.html/app.js/styles.css)
```

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
