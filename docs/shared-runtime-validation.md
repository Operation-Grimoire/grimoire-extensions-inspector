# Shared-runtime migration validation

Local Windows/JDK 21 checks completed 2026-11-08 (UTC evidence dated 2026-11-09).
Inspector base: `79679015410777b702d12bcf68c4ad115863f10b`.
API: local `shared-jvm-runtime` branch with `extensions-core:1.3.0-SNAPSHOT`.
Extensions base: `c602223b8e48b137098fea9eff62d63f0140cc66`.

```sh
./gradlew clean test installDist -Pext=EXTENSIONS_CHECKOUT \
  -Papi=SHARED_API_CHECKOUT --no-build-cache --console=plain
./build/install/inspector/bin/inspector list --json
./build/install/inspector/bin/inspector run --all --offline --json
./build/install/inspector/bin/inspector run --source "Royal Road" \
  --query "Mother of Learning" --timeout 120 --json
```

The original source-compiling baseline built successfully. The migrated host
passed five deterministic tests and discovered all 26 current source classes.
All 26 passed the offline structural suite with zero errors and zero warnings.
Tests cover one shared core class, source identity/client ownership, HTTP and
direct CookieManager sharing, UA updates, path/domain/host-only/Secure/expiry
matching, session cleanup and headless challenge reporting.

Live Royal Road completed popular/latest/search (20 items each), details,
109 chapters, 172 first-chapter content blocks and 14 filters with zero errors.
Two `THUMBNAIL_EMPTY` warnings affected five latest entries and seven search
entries. These source presentation warnings remain unresolved by this runtime
migration. No authenticated source account or browser challenge solve was tested.

The core detector is also used by the Android adapter. Inspector compiles no API
source tree and loads no Android AAR. GalaxyNovels still needs the small
`NetworkContext.context == null` compatibility shim. Browser stubs cannot run
interactive login or source WebViews; success here is headless JVM evidence.

The web API routes remain the same, but browser UI interactions were not rerun.
The published-package path and remote CI are unexecuted. Until the core package
is published, use the explicit API composite above. Coordinate producer and
Inspector consumer changes before relying on the changed API source layout.
