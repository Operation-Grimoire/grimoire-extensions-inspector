pluginManagement {
    repositories {
        gradlePluginPortal()
        mavenCentral()
    }
}

dependencyResolutionManagement {
    repositories {
        mavenCentral()
    }
}

rootProject.name = "grimoire-extensions-inspector"

// Optional source development; the host still consumes a JVM artifact, never API sources.
val apiDir = providers.gradleProperty("api").orNull
    ?: providers.gradleProperty("grimoireApiDir").orNull
apiDir?.let {
    require(file("$it/core/build.gradle.kts").isFile) { "-Papi must point to an API checkout with extensions-core" }
    includeBuild(it) {
        dependencySubstitution {
            substitute(module("io.grimoire:extensions-core")).using(project(":core"))
        }
    }
}
