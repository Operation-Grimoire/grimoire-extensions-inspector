plugins {
    kotlin("jvm") version "2.2.10"
    kotlin("plugin.serialization") version "2.2.10"
    application
}

repositories {
    mavenCentral()
}

// --- Which extensions to compile & inspect (REQUIRED at run time) ------------
// The extensions repo is not assumed to live anywhere in particular — you pass
// its path each run:  -Pext=/path/to/grimoire-extensions  (alias: -PgrimoireExtDir).
// API and lib default to next-to / inside the extensions repo; override if not:
//   -Papi=/path/to/grimoire-extensions-api   (alias -PgrimoireApiDir)
//   -Plib=/path/to/lib-root                  (alias -PgrimoireLibDir)
// A value put in gradle.properties / ~/.gradle/gradle.properties also satisfies it.
// Use providers.gradleProperty (not findProperty) so the short `ext` alias
// doesn't collide with Gradle's built-in `ext` extra-properties extension.
fun prop(vararg keys: String): String? =
    keys.firstNotNullOfOrNull { providers.gradleProperty(it).orNull?.takeIf { v -> v.isNotBlank() } }

val extDir = prop("ext", "grimoireExtDir")
val apiDir = prop("api", "grimoireApiDir") ?: extDir?.let { "$it/../grimoire-extensions-api" }
val libDir = prop("lib", "grimoireLibDir") ?: extDir?.let { "$it/lib" }
val xDir = prop("extx", "grimoireExtXDir")
val includeX = (prop("includeX", "grimoireIncludeX"))?.toBoolean() ?: false

// Only the tasks that actually need the sources should hard-fail when the path
// is missing — `gradlew tasks`, `help`, etc. still work without it.
val sourceHungryTasks = setOf(
    "run", "compileKotlin", "compileJava", "classes", "build", "assemble",
    "jar", "installDist", "distZip", "distTar", "listSourceDirs",
)
val needsSources = gradle.startParameter.taskNames.any { it.substringAfterLast(':') in sourceHungryTasks }
if (needsSources && extDir == null) {
    throw GradleException(
        """
        No extensions path provided. Pass the extensions repo (or any sibling repo
        of the same src/{lang}/{name} shape) when you run:

          ./gradlew run -Pext=/path/to/grimoire-extensions --args="run --all --json"

        Optional overrides (default next to / inside -Pext):
          -Papi=/path/to/grimoire-extensions-api
          -Plib=/path/to/lib-root
          -PincludeX=true -Pextx=/path/to/grimoire-extensions-x
        """.trimIndent(),
    )
}

// Glob every extension's main source dir: $root/src/{lang}/{name}/src/main/java
fun extensionSrcDirs(root: String): List<String> {
    val srcRoot = file("$root/src")
    if (!srcRoot.isDirectory) return emptyList()
    val out = mutableListOf<String>()
    srcRoot.listFiles()?.filter { it.isDirectory }?.forEach { langDir ->
        langDir.listFiles()?.filter { it.isDirectory }?.forEach { ext ->
            val main = file("${ext.path}/src/main/java")
            if (main.isDirectory) out += main.path
        }
    }
    return out
}

// API + lib + every extension, compiled from source as plain JVM Kotlin against
// our android-stubs (in src/main/kotlin). No Android SDK, no AGP, no emulator.
val upstreamSrc: List<String> = if (extDir == null) emptyList() else buildList {
    apiDir?.let { add(file("$it/api/src/main/java").path) }
    libDir?.let { add(file("$it/src/main/java").path) }
    addAll(extensionSrcDirs(extDir))
    if (includeX && xDir != null) addAll(extensionSrcDirs(xDir))
}

sourceSets {
    main {
        // Kotlin compiles .kt found in java srcDirs too — this is how the
        // upstream extension sources get pulled into one JVM classpath.
        java.srcDirs(upstreamSrc)
    }
}

dependencies {
    // Same versions the API/extensions use, so runtime behaviour is identical.
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.jsoup:jsoup:1.17.2")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.9.0")
    // Android ships org.json; on the JVM we add the upstream artifact.
    implementation("org.json:json:20240303")

    implementation("io.github.classgraph:classgraph:4.8.179")
    implementation("com.github.ajalt.clikt:clikt:4.4.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")

    val ktor = "2.3.13"
    implementation("io.ktor:ktor-server-core:$ktor")
    implementation("io.ktor:ktor-server-cio:$ktor")
    implementation("io.ktor:ktor-server-content-negotiation:$ktor")
    implementation("io.ktor:ktor-serialization-kotlinx-json:$ktor")
}

kotlin {
    jvmToolchain(21)
}

application {
    mainClass.set("io.grimoire.inspector.MainKt")
    applicationName = "inspector"
}

// Print which extensions got wired in, for sanity.
tasks.register("listSourceDirs") {
    doLast {
        println("EXT   : $extDir")
        println("API   : $apiDir")
        println("LIB   : $libDir")
        println("includeX = $includeX  (xDir=$xDir)")
        if (upstreamSrc.isEmpty()) println("  (no sources — pass -Pext=…)")
        upstreamSrc.forEach { println("  src  $it") }
    }
}
