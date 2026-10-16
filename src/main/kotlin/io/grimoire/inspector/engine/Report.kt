package io.grimoire.inspector.engine

import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.LongAsStringSerializer

enum class Severity { INFO, WARN, ERROR }

@Serializable
data class Diagnostic(
    val stage: String,
    val severity: Severity,
    val code: String,
    val message: String,
    val count: Int? = null,
    val samples: List<String> = emptyList(),
    val exceptionType: String? = null,
)

@Serializable
data class SourceMeta(
    // A string in JSON: source ids are 64-bit and exceed JavaScript's safe
    // integer range, so a JSON number would be rounded by the web UI.
    @Serializable(with = LongAsStringSerializer::class)
    val id: Long,
    val name: String,
    val lang: String,
    val baseUrl: String,
    val versionCode: Int,
    val className: String,
    val capabilities: List<String>,
    val hasDynamicFilters: Boolean,
    val supportsSearchWithFilters: Boolean,
    val hosts: List<String> = emptyList(),
    val activeHost: String? = null,
    val languages: List<String> = emptyList(),
)

@Serializable
data class StageResult(
    val stage: String,
    val status: String, // ok | warn | error | skipped | info
    val durationMs: Long,
    val counts: Map<String, Int> = emptyMap(),
    val diagnostics: List<Diagnostic> = emptyList(),
    val target: String? = null, // the url/query this stage probed, if any
)

/** The novel the details/chapters/pages stages were run against. */
@Serializable
data class Probe(val title: String, val url: String)

@Serializable
data class SourceReport(
    val source: SourceMeta,
    val ok: Boolean,
    val stages: List<StageResult>,
    val errors: Int,
    val warnings: Int,
    val probe: Probe? = null,
)

@Serializable
data class Totals(val sources: Int, val errors: Int, val warnings: Int)

@Serializable
data class RunReport(
    val schemaVersion: Int = 2, // 2: source.id is a JSON string
    val startedAt: String,
    val durationMs: Long,
    val query: String,
    val sources: List<SourceReport>,
    val totals: Totals,
)
