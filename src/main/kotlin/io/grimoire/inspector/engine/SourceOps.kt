package io.grimoire.inspector.engine

import io.grimoire.api.model.filter.Filter
import io.grimoire.api.model.lang.Language
import io.grimoire.api.model.novel.Chapter
import io.grimoire.api.model.novel.Novel
import io.grimoire.api.model.novel.NovelPage
import io.grimoire.api.model.pref.PrefValue
import io.grimoire.api.model.pref.SourcePreference
import io.grimoire.api.network.defaultOkHttpClient
import io.grimoire.api.source.epub.EpubSource
import io.grimoire.api.source.feature.ConfigurableSource
import io.grimoire.api.source.feature.FilterSource
import io.grimoire.api.source.feature.LatestSource
import io.grimoire.api.source.feature.MultiHostSource
import io.grimoire.api.source.feature.MultiLanguageSource
import io.grimoire.api.source.feature.PopularSource
import io.grimoire.api.source.feature.SearchSource
import io.grimoire.api.source.feature.WebViewLoginSource
import io.grimoire.api.source.http.HttpSource
import io.grimoire.api.source.web.ChapterListSource
import io.grimoire.api.source.web.PageListSource
import io.grimoire.api.source.web.PaginatedSource
import io.grimoire.inspector.DiscoveredSource
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request

/**
 * Thin, app-mimicking wrapper around a single source instance. Every live
 * operation goes through here so the CLI suite and the web endpoints behave
 * identically.
 *
 * The API is capability-based — a source mixes in only the interfaces it
 * supports — so each capability is resolved once via `as?` and the operations
 * delegate to whichever facet is present (or fail with a clear message).
 */
/** Outcome of probing whether an image URL loads. */
class ImageProbe(val ok: Boolean, val detail: String)

class SourceOps(val ds: DiscoveredSource) {

    val source = ds.instance

    private val popularSrc = source as? PopularSource
    private val latestSrc = source as? LatestSource
    private val searchSrc = source as? SearchSource
    private val filterSrc = source as? FilterSource
    private val chapterListSrc = source as? ChapterListSource
    private val paginatedSrc = source as? PaginatedSource
    private val pageListSrc = source as? PageListSource
    private val multiHost = source as? MultiHostSource
    private val multiLang = source as? MultiLanguageSource

    /** Can this source produce a browse/search novel list at all? */
    val canBrowse: Boolean get() = popularSrc != null || latestSrc != null || searchSrc != null

    val hasDynamicFilters: Boolean get() = filterSrc?.hasDynamicFilters ?: false
    val supportsSearchWithFilters: Boolean get() = searchSrc?.supportsSearchWithFilters ?: false

    val hosts: List<String> get() = multiHost?.hosts ?: emptyList()
    val activeHost: String? get() = multiHost?.activeHost

    /** Pin the mirror to route through (blank resets to the first host). */
    fun setHost(host: String) = multiHost?.setActiveHost(host) ?: Unit

    /** Available languages (codes) for a MultiLanguageSource; empty otherwise. */
    suspend fun languages(): List<String> = multiLang?.availableLanguages()?.map { it.code } ?: emptyList()

    /** Restrict browse/search to these language codes (empty = no filter, all). */
    fun setLanguages(langs: Set<String>) =
        multiLang?.setEnabledLanguages(langs.mapNotNull(::languageOf).toSet()) ?: Unit

    /** Popular count for a single language, on a FRESH instance so the per-
     *  language probes don't race the shared source's enabled-language state.
     *  Returns -1 if the source can't be exercised for that language. */
    suspend fun popularForLanguage(lang: String, page: Int = 1): Int {
        val fresh = runCatching { source.javaClass.getDeclaredConstructor().newInstance() }.getOrNull()
        languageOf(lang)?.let { (fresh as? MultiLanguageSource)?.setEnabledLanguages(setOf(it)) }
        val p = fresh as? PopularSource ?: return -1
        return p.getPopularNovels(page).size
    }

    suspend fun popular(page: Int): List<Novel> =
        (popularSrc ?: error("${ds.name} does not support popular")).getPopularNovels(page)
    suspend fun latest(page: Int): List<Novel> =
        (latestSrc ?: error("${ds.name} does not support latest")).getLatestUpdates(page)
    suspend fun search(query: String, page: Int, filters: List<Filter<*>> = emptyList()): List<Novel> =
        (searchSrc ?: error("${ds.name} does not support search")).searchNovels(query, page, filters)

    fun filterList(): List<Filter<*>> = filterSrc?.getFilterList() ?: emptyList()
    suspend fun fetchFilters(): List<Filter<*>> = filterSrc?.fetchFilterOptions() ?: emptyList()

    /** A brand-new instance as a FilterSource, via the same no-arg ctor the app
     *  uses. `fetchFilterOptions` mutates a source's filter state, so the
     *  dynamic-filters check needs a cold instance to compare before/after —
     *  the shared [source] keeps options cached between runs. */
    fun freshFilterSource(): FilterSource? =
        runCatching { source.javaClass.getDeclaredConstructor().newInstance() as? FilterSource }.getOrNull()

    suspend fun details(url: String): Novel = source.getNovelDetails(stubNovel(url))

    suspend fun chapters(url: String, page: Int? = null, concurrency: Int = 1): List<Chapter> {
        val novel = stubNovel(url)
        val paged = paginatedSrc
        // Explicit page → that single page. No page → the full list: a paginated
        // source's getChapterList(novel) only returns page 1, so walk pages until
        // one is empty or stops yielding new URLs (overflow guard), accumulating.
        // concurrency>1 fetches pages in parallel batches (faster for long lists).
        return when {
            page != null && paged != null -> paged.getChapterList(novel, page)
            paged != null -> allChapterPages(paged, novel, concurrency.coerceIn(1, MAX_CHAPTER_CONCURRENCY))
            else -> (chapterListSrc ?: error("${ds.name} does not support a chapter list")).getChapterList(novel)
        }
    }

    private suspend fun allChapterPages(paged: PaginatedSource, novel: Novel, concurrency: Int): List<Chapter> {
        val all = mutableListOf<Chapter>()
        val seen = HashSet<String>()
        var next = 1
        while (next <= MAX_CHAPTER_PAGES) {
            val pages = (next until (next + concurrency)).toList()
            // Fetch this batch of pages concurrently, then consume them in order.
            val batches = coroutineScope { pages.map { p -> async { paged.getChapterList(novel, p) } }.awaitAll() }
            var stop = false
            for (batch in batches) {
                if (batch.isEmpty()) { stop = true; break }
                val newCount = batch.count { seen.add(it.url) } // count{}: no short-circuit
                all += batch
                if (newCount == 0) { stop = true; break } // page repeated only already-seen URLs
            }
            if (stop) break
            next += concurrency
        }
        return all
    }

    suspend fun pages(url: String): List<NovelPage> =
        (pageListSrc ?: error("${ds.name} does not support page content")).getPageList(stubChapter(url))

    suspend fun epub(url: String): ByteArray = (source as EpubSource).getEpub(stubNovel(url))

    fun prefs(): List<SourcePreference> = (source as? ConfigurableSource)?.getPreferences() ?: emptyList()

    /** Apply string-form pref values, coercing to the declared [PrefValue] type per key. */
    fun setPrefs(values: Map<String, String>) {
        val cfg = source as? ConfigurableSource ?: return
        val byKey = cfg.getPreferences().associateBy { it.key }
        cfg.setPreferences(
            values.mapValues { (key, value) ->
                when (byKey[key]) {
                    is SourcePreference.Switch -> PrefValue.Bool(value.toBoolean())
                    else -> PrefValue.Str(value)
                }
            },
        )
    }

    val loginUrl: String? get() = (source as? WebViewLoginSource)?.loginUrl
    suspend fun isLoggedIn(): Boolean? = (source as? WebViewLoginSource)?.isLoggedIn()

    /** The source's own OkHttp client (UA + cookie jar), for the image proxy. */
    fun client(): OkHttpClient = (source as? HttpSource)?.client ?: defaultOkHttpClient()

    /** Fetch an image URL through the source's client (UA/cookies/CF apply) and
     *  judge whether it actually loaded — a 2xx with non-empty, non-HTML body.
     *  Resolution mirrors the /img proxy (relative URLs joined to baseUrl). */
    suspend fun imageStatus(url: String): ImageProbe = withContext(Dispatchers.IO) {
        val full = if (url.startsWith("http")) url else ds.baseUrl.trimEnd('/') + "/" + url.trimStart('/')
        runCatching {
            client().newCall(Request.Builder().url(full).build()).execute().use { resp ->
                val ct = resp.body?.contentType()?.toString().orEmpty()
                val size = resp.body?.bytes()?.size ?: 0
                when {
                    !resp.isSuccessful -> ImageProbe(false, "HTTP ${resp.code}")
                    size == 0 -> ImageProbe(false, "empty body")
                    ct.contains("html", ignoreCase = true) || ct.startsWith("text/") ->
                        ImageProbe(false, "not an image (Content-Type: ${ct.ifBlank { "?" }})")
                    else -> ImageProbe(true, "$ct ${size}b")
                }
            }
        }.getOrElse { ImageProbe(false, it.message ?: it.javaClass.simpleName) }
    }

    fun capabilities(): List<String> = buildList {
        if (source is PopularSource) add("PopularSource")
        if (source is LatestSource) add("LatestSource")
        if (source is SearchSource) add("SearchSource")
        if (source is FilterSource) add("FilterSource")
        if (source is ChapterListSource) add("ChapterListSource")
        if (source is PaginatedSource) add("PaginatedSource")
        if (source is PageListSource) add("PageListSource")
        if (source is ConfigurableSource) add("ConfigurableSource")
        if (source is WebViewLoginSource) add("WebViewLoginSource")
        if (source is MultiLanguageSource) add("MultiLanguageSource")
        if (source is EpubSource) add("EpubSource")
        if (source is MultiHostSource) add("MultiHostSource")
    }

    suspend fun meta(): SourceMeta = SourceMeta(
        id = ds.id,
        name = ds.name,
        lang = ds.lang,
        baseUrl = ds.baseUrl,
        versionCode = ds.versionCode,
        className = ds.className,
        capabilities = capabilities(),
        hasDynamicFilters = hasDynamicFilters,
        supportsSearchWithFilters = supportsSearchWithFilters,
        hosts = hosts,
        activeHost = activeHost,
        languages = languages(),
    )

    // The host passes full domain objects; for one-shot calls we only need the
    // url the request builders read.
    private fun stubNovel(url: String) = Novel(url = url, title = "", language = Language.UNKNOWN)
    private fun stubChapter(url: String) = Chapter(url = url, name = "")

    private fun languageOf(code: String): Language? =
        Language.entries.firstOrNull { it.code.equals(code, ignoreCase = true) }

    companion object {
        // Safety cap on chapter-page walking, so a source that never returns an
        // empty page can't loop forever.
        private const val MAX_CHAPTER_PAGES = 500

        // Upper bound on parallel page fetches, to avoid hammering a source.
        private const val MAX_CHAPTER_CONCURRENCY = 16
    }
}
