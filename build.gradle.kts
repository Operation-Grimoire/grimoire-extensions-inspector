plugins {
    kotlin("jvm") version "2.2.10"
    kotlin("plugin.serialization") version "2.2.10"
    application
}

repositories {
    mavenCentral()
}

// --- Where the sibling Grimoire checkouts live (override with -P… if needed) ---
// Defaults assume all repos are checked out side-by-side in the same parent dir.
val apiDir = (findProperty("grimoireApiDir") as String?) ?: "../grimoire-extensions-api"
val extDir = (findProperty("grimoireExtDir") as String?) ?: "../grimoire-extensions"
val xDir = (findProperty("grimoireExtXDir") as String?) ?: "../grimoire-extensions-x"
val includeX = (findProperty("grimoireIncludeX") as String?)?.toBoolean() ?: false

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
val upstreamSrc: List<String> = buildList {
    add(file("$apiDir/api/src/main/java").path)
    add(file("$extDir/lib/src/main/java").path)
    addAll(extensionSrcDirs(extDir))
    if (includeX) addAll(extensionSrcDirs(xDir))
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
        println("API   : $apiDir")
        println("EXT   : $extDir")
        println("includeX = $includeX")
        upstreamSrc.forEach { println("  src  $it") }
    }
}
