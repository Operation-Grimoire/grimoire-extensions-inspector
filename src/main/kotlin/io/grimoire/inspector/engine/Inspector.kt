package io.grimoire.inspector.engine

import io.grimoire.api.model.Chapter
import io.grimoire.api.model.Filter
import io.grimoire.api.model.Novel
import io.grimoire.api.network.CloudflareException
import io.grimoire.api.source.ConfigurableSource
import io.grimoire.api.source.WebViewLoginSource
import io.grimoire.inspector.DiscoveredSource
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.withTimeout
import java.time.Instant

class StageOutcome(
    val diagnostics: List<Diagnostic>,
    val counts: Map<String, Int> = emptyMap(),
)

/** Runs the full app-mimicking suite over a set of sources. */
class Inspector(
    private val query: String = "the",
    private val timeoutMs: Long = 30_000,
    private val offline: Boolean = false,
) {

    suspend fun run(sources: List<DiscoveredSource>): RunReport {
        val started = Instant.now().toString()
        val t0 = System.currentTimeMillis()
        val reports = sources.map { inspect(it) }
        val errors = reports.sumOf { it.errors }
        val warnings = reports.sumOf { it.warnings }
        return RunReport(
            startedAt = started,
            durationMs = System.currentTimeMillis() - t0,
            query = query,
            sources = reports,
            totals = Totals(reports.size, errors, warnings),
        )
    }

    suspend fun inspect(ds: DiscoveredSource): SourceReport {
        val ops = SourceOps(ds)
        val stages = mutableListOf<StageResult>()

        // capabilities — always, informational, no network.
        val caps = ops.capabilities()
        val capDiags = mutableListOf(
            Diagnostic("capabilities", Severity.INFO, "CAPABILITIES", caps.joinToString(", "), samples = caps),
        )
        ops.loginUrl?.let { capDiags += Diagnostic("capabilities", Severity.INFO, "LOGIN_URL", it) }
        stages += StageResult("capabilities", "info", 0, emptyMap(), capDiags)

        if (ops.catalogue == null) {
            return finalize(ops, stages) // nothing browsable
        }

        var firstNovel: Novel? = null
        var detailed: Novel? = null
        var firstChapter: Chapter? = null

        stages += stage("popular") {
            val list = ops.popular(1)
            firstNovel = list.firstOrNull()
            StageOutcome(Checks.novels("popular", list), mapOf("items" to list.size))
        }

        stages += stage("details", target = firstNovel?.url) {
            val n = firstNovel ?: return@stage skipped("details", "no novel from popular")
            val d = ops.details(n.url)
            detailed = d
            StageOutcome(Checks.details(d))
        }

        stages += stage("chapters", target = (detailed ?: firstNovel)?.url) {
            val n = detailed ?: firstNovel ?: return@stage skipped("chapters", "no novel to query")
            val list = ops.chapters(n.url)
            firstChapter = list.firstOrNull { !it.locked } ?: list.firstOrNull()
            StageOutcome(Checks.chapters(list), mapOf("items" to list.size))
        }

        stages += stage("pages", target = firstChapter?.url) {
            val c = firstChapter ?: return@stage skipped("pages", "no chapter to read")
            if (c.locked) {
                return@stage StageOutcome(listOf(Diagnostic("pages", Severity.INFO, "LOCKED", "only locked chapters available; skipping read")))
            }
            val list = ops.pages(c.url)
            StageOutcome(Checks.pages(list), mapOf("items" to list.size))
        }

        stages += stage("latest") {
            val list = ops.latest(1)
            StageOutcome(Checks.novels("latest", list), mapOf("items" to list.size))
        }

        stages += stage("search", target = "query=\"$query\"") {
            val list = ops.search(query, 1)
            val diags = if (list.isEmpty()) {
                listOf(Diagnostic("search", Severity.WARN, "SEARCH_EMPTY", "search '$query' returned 0 results"))
            } else {
                Checks.novels("search", list)
            }
            StageOutcome(diags, mapOf("items" to list.size))
        }

        // filters are computed without network unless dynamic.
        stages += stage("filters", network = false) {
            val base = ops.filterList()
            StageOutcome(
                listOf(Diagnostic("filters", Severity.INFO, "FILTERS", "${base.size} filter(s)", base.size, base.map { it.name })),
                mapOf("items" to base.size),
            )
        }
        if (ops.catalogue?.hasDynamicFilters == true) {
            stages += stage("fetchFilters") {
                // A dynamic source claims it fetches options over the network.
                // Verify by comparing total option-weight cold vs. after fetch —
                // works whether the dynamic filter is a Group or a Select.
                val before = optionWeight(ops.filterList())
                val opts = ops.fetchFilters()
                val after = optionWeight(opts)
                val diags = if (after <= before) {
                    listOf(Diagnostic("fetchFilters", Severity.WARN, "DYNAMIC_FILTERS_EMPTY", "fetchFilterOptions added no options (weight $before -> $after)"))
                } else {
                    listOf(Diagnostic("fetchFilters", Severity.INFO, "FILTERS", "fetched options (weight $before -> $after, ${opts.size} filters)", opts.size, opts.map { it.name }))
                }
                StageOutcome(diags, mapOf("items" to opts.size, "optionWeight" to after))
            }
        }

        if (ops.source is ConfigurableSource) {
            val prefs = ops.prefs()
            stages += StageResult(
                "config", "info", 0, mapOf("prefs" to prefs.size),
                listOf(Diagnostic("config", Severity.INFO, "PREFERENCES", prefs.joinToString { it.key }, prefs.size, prefs.map { it.key })),
            )
        }

        if (ops.source is WebViewLoginSource) {
            stages += stage("login") {
                val logged = ops.isLoggedIn()
                StageOutcome(listOf(Diagnostic("login", Severity.INFO, "LOGIN_STATE", "isLoggedIn=$logged; loginUrl=${ops.loginUrl}")))
            }
        }

        val probe = (detailed ?: firstNovel)?.let { Probe(it.title, it.url) }
        return finalize(ops, stages, probe)
    }

    private suspend fun stage(
        name: String,
        network: Boolean = true,
        target: String? = null,
        block: suspend () -> StageOutcome,
    ): StageResult {
        if (offline && network) return StageResult(name, "skipped", 0, target = target)
        val t0 = System.currentTimeMillis()
        return try {
            val outcome = withTimeout(timeoutMs) { block() }
            StageResult(name, statusOf(outcome.diagnostics), elapsed(t0), outcome.counts, outcome.diagnostics, target)
        } catch (e: CloudflareException) {
            StageResult(
                name, "warn", elapsed(t0), emptyMap(),
                listOf(Diagnostic(name, Severity.WARN, "CLOUDFLARE_BLOCKED", e.message ?: "Cloudflare challenge", exceptionType = e.javaClass.simpleName)),
                target,
            )
        } catch (e: TimeoutCancellationException) {
            StageResult(
                name, "error", elapsed(t0), emptyMap(),
                listOf(Diagnostic(name, Severity.ERROR, "TIMEOUT", "timed out after ${timeoutMs}ms", exceptionType = "TimeoutCancellationException")),
                target,
            )
        } catch (e: Throwable) {
            StageResult(
                name, "error", elapsed(t0), emptyMap(),
                listOf(Diagnostic(name, Severity.ERROR, classify(e), e.message ?: e.toString(), exceptionType = e.javaClass.simpleName)),
                target,
            )
        }
    }

    private fun skipped(stage: String, why: String) =
        StageOutcome(listOf(Diagnostic(stage, Severity.WARN, "SKIPPED", why)))

    /** Total selectable-option count across a filter list (Group children +
     *  Select values), used to tell whether fetchFilterOptions actually added
     *  anything regardless of which filter kind carries the dynamic options. */
    private fun optionWeight(filters: List<Filter<*>>): Int = filters.sumOf {
        when (it) {
            is Filter.Group<*> -> it.state.size
            is Filter.Select<*> -> it.values.size
            else -> 0
        }
    }

    private fun finalize(ops: SourceOps, stages: List<StageResult>, probe: Probe? = null): SourceReport {
        val errors = stages.sumOf { st -> st.diagnostics.count { it.severity == Severity.ERROR } }
        val warnings = stages.sumOf { st -> st.diagnostics.count { it.severity == Severity.WARN } }
        return SourceReport(ops.meta(), errors == 0, stages, errors, warnings, probe)
    }

    private fun statusOf(diags: List<Diagnostic>): String = when {
        diags.any { it.severity == Severity.ERROR } -> "error"
        diags.any { it.severity == Severity.WARN } -> "warn"
        else -> "ok"
    }

    private fun classify(e: Throwable): String = when (e) {
        is java.net.SocketTimeoutException -> "TIMEOUT"
        is java.net.UnknownHostException -> "DNS_ERROR"
        is java.io.IOException -> "NETWORK_ERROR"
        is NullPointerException -> "PARSE_NPE"
        is IndexOutOfBoundsException -> "PARSE_INDEX"
        else -> "EXCEPTION"
    }

    private fun elapsed(t0: Long) = System.currentTimeMillis() - t0
}
