package io.grimoire.inspector

import io.github.classgraph.ClassGraph
import io.grimoire.api.source.Source
import io.grimoire.api.source.SourceInfo
import io.grimoire.api.source.sourceIdFor

/** A source instance plus its declared @SourceInfo metadata. */
data class DiscoveredSource(
    val instance: Source,
    val id: Long,
    val name: String,
    val lang: String,
    val baseUrl: String,
    val versionCode: Int,
    val className: String,
)

object SourceDiscovery {

    /**
     * Scans the runtime classpath for classes annotated with @SourceInfo (the
     * same metadata the app keys on) and instantiates each via its no-arg
     * constructor — mirroring how the app loads a source. Failures to load a
     * single source are reported to stderr and skipped, so one broken
     * extension never sinks the rest.
     */
    fun discover(): List<DiscoveredSource> {
        val out = mutableListOf<DiscoveredSource>()
        ClassGraph()
            .enableClassInfo()
            .enableAnnotationInfo()
            // Only our extensions — never the bundled Tachiyomi `eu.kanade.*` tree.
            .acceptPackages("io.grimoire.extension", "io.grimoire.extensions")
            .scan()
            .use { scan ->
                for (ci in scan.getClassesWithAnnotation(SourceInfo::class.java.name)) {
                    runCatching {
                        val clazz = ci.loadClass()
                        val instance = clazz.getDeclaredConstructor().newInstance() as Source
                        val ann = clazz.getAnnotation(SourceInfo::class.java)
                        out += DiscoveredSource(
                            instance = instance,
                            // Identity is derived from the package name (mirrors the
                            // app's sourceIdFor), since SourceInfo no longer carries an id.
                            id = sourceIdFor(clazz.getPackage()?.name ?: clazz.name),
                            name = ann?.name ?: instance.name,
                            lang = (ann?.lang ?: instance.lang).code,
                            baseUrl = ann?.baseUrl ?: "",
                            versionCode = ann?.versionCode ?: 1,
                            className = clazz.name,
                        )
                    }.onFailure { e ->
                        System.err.println("[discover] failed to load ${ci.name}: ${e.message}")
                    }
                }
            }
        return out.sortedBy { it.id }
    }
}
