package io.grimoire.inspector.engine

import io.grimoire.api.model.Chapter
import io.grimoire.api.model.Filter
import io.grimoire.api.model.Novel
import io.grimoire.api.network.CloudflareException
import io.grimoire.api.source.ConfigurableSource
import io.grimoire.api.source.EpubSource
import io.grimoire.api.source.MultiLanguageSource
import io.grimoire.api.source.WebViewLoginSource
import io.grimoire.inspector.DiscoveredSource
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
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
    private val chapterConcurrency: Int = 1,
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
            StageOutcome(
                Checks.novels("popular", list) + probeImages(ops, "popular", list.map { it.thumbnailUrl }),
                mapOf("items" to list.size),
            )
        }

        stages += stage("details", target = firstNovel?.url) {
            val n = firstNovel ?: return@stage skipped("details", "no novel from popular")
            val d = ops.details(n.url)
            detailed = d
            StageOutcome(
                Checks.details(d, multiLang = ops.source is MultiLanguageSource) +
                    probeImages(ops, "details", listOfNotNull(d.thumbnailUrl)),
            )
        }

        if (ops.source is EpubSource) {
            // EPUB sources deliver the whole book as one file; getChapterList /
            // getPageList are unused, so probe getEpub instead of chapters/pages.
            stages += stage("epub", target = (detailed ?: firstNovel)?.url) {
                val n = detailed ?: firstNovel ?: return@stage skipped("epub", "no novel to download")
                val bytes = ops.epub(n.url)
                StageOutcome(Checks.epub(bytes), mapOf("bytes" to bytes.size))
            }
        } else {
            stages += stage("chapters", target = (detailed ?: firstNovel)?.url) {
                val n = detailed ?: firstNovel ?: return@stage skipped("chapters", "no novel to query")
                val list = ops.chapters(n.url, concurrency = chapterConcurrency)
                firstChapter = list.firstOrNull { !it.locked } ?: list.firstOrNull()
                StageOutcome(Checks.chapters(list), mapOf("items" to list.size))
            }

            stages += stage("pages", target = firstChapter?.url) {
                val c = firstChapter ?: return@stage skipped("pages", "no chapter to read")
                if (c.locked) {
                    return@stage StageOutcome(listOf(Diagnostic("pages", Severity.INFO, "LOCKED", "only locked chapters available; skipping read")))
                }
                val list = ops.pages(c.url)
                StageOutcome(
                    Checks.pages(list) + probeImages(ops, "pages", list.mapNotNull { it.imageUrl }),
                    mapOf("items" to list.size),
                )
            }
        }

        stages += stage("latest") {
            val list = ops.latest(1)
            StageOutcome(
                Checks.novels("latest", list) + probeImages(ops, "latest", list.map { it.thumbnailUrl }),
                mapOf("items" to list.size),
            )
        }

        stages += stage("search", target = "query=\"$query\"") {
            val list = ops.search(query, 1)
            val diags = if (list.isEmpty()) {
                listOf(Diagnostic("search", Severity.WARN, "SEARCH_EMPTY", "search '$query' returned 0 results"))
            } else {
                Checks.novels("search", list) + probeImages(ops, "search", list.map { it.thumbnailUrl })
            }
            StageOutcome(diags, mapOf("items" to list.size))
        }

        if (ops.source is MultiLanguageSource && ops.languages.isNotEmpty()) {
            stages += stage("languages") {
                val langs = ops.languages
                val empties = checkLanguages(ops, langs)
                val diags = if (empties.isEmpty()) {
                    listOf(Diagnostic("languages", Severity.INFO, "LANGUAGES_OK", "all ${langs.size} languages return popular novels", langs.size))
                } else {
                    listOf(Diagnostic("languages", Severity.WARN, "LANGUAGE_NO_RESULTS", "${empties.size}/${langs.size} languages returned 0 popular novels", empties.size, empties))
                }
                StageOutcome(diags, mapOf("languages" to langs.size))
            }
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
                // works whether the dynamic filter is a Group or a Select. Use a
                // FRESH instance: fetchFilterOptions mutates filter state, so the
                // shared source would already be populated on a rerun (before ==
                // after) and wrongly look like a no-op.
                val fresh = ops.freshCatalogue()
                val before = optionWeight(fresh?.getFilterList() ?: ops.filterList())
                val opts = fresh?.fetchFilterOptions() ?: ops.fetchFilters()
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

    /** Fetch a sample of the view's image URLs and flag any that don't load
     *  (404, empty, or an HTML error page instead of bytes). Sampled to keep the
     *  suite from downloading every cover/page. */
    private suspend fun probeImages(ops: SourceOps, stage: String, urls: List<String?>): List<Diagnostic> {
        val targets = urls.filterNotNull().filter { it.isNotBlank() }.distinct().take(IMAGE_SAMPLE)
        if (targets.isEmpty()) return emptyList()
        val broken = targets.mapNotNull { u ->
            val p = ops.imageStatus(u)
            if (!p.ok) "$u → ${p.detail}" else null
        }
        return if (broken.isEmpty()) emptyList()
        else listOf(Diagnostic(stage, Severity.WARN, "IMAGE_LOAD_FAILED", "${broken.size}/${targets.size} sampled images failed to load", broken.size, broken))
    }

    /** Probe each available language's popular page (on fresh instances, in
     *  capped parallel batches) and return the languages that yielded 0 novels.
     *  Languages that errored (-1, e.g. Cloudflare) are not flagged as empty. */
    private suspend fun checkLanguages(ops: SourceOps, langs: List<String>): List<String> = coroutineScope {
        val results = mutableListOf<Pair<String, Int>>()
        for (batch in langs.chunked(LANG_CONCURRENCY)) {
            results += batch.map { lang ->
                async { lang to runCatching { ops.popularForLanguage(lang) }.getOrDefault(-1) }
            }.awaitAll()
        }
        results.filter { it.second == 0 }.map { it.first }
    }

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

    private companion object {
        // Images probed per view, to bound the suite's network cost.
        const val IMAGE_SAMPLE = 3

        // Parallel per-language popular probes in the languages stage.
        const val LANG_CONCURRENCY = 6
    }
}
