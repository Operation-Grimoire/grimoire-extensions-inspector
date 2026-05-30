package io.grimoire.inspector.engine

import kotlinx.serialization.Serializable

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
    val id: Long,
    val name: String,
    val lang: String,
    val baseUrl: String,
    val versionCode: Int,
    val className: String,
    val capabilities: List<String>,
    val hasDynamicFilters: Boolean,
    val supportsSearchWithFilters: Boolean,
)

@Serializable
data class StageResult(
    val stage: String,
    val status: String, // ok | warn | error | skipped | info
    val durationMs: Long,
    val counts: Map<String, Int> = emptyMap(),
    val diagnostics: List<Diagnostic> = emptyList(),
)

@Serializable
data class SourceReport(
    val source: SourceMeta,
    val ok: Boolean,
    val stages: List<StageResult>,
    val errors: Int,
    val warnings: Int,
)

@Serializable
data class Totals(val sources: Int, val errors: Int, val warnings: Int)

@Serializable
data class RunReport(
    val schemaVersion: Int = 1,
    val startedAt: String,
    val durationMs: Long,
    val query: String,
    val sources: List<SourceReport>,
    val totals: Totals,
)
