package io.grimoire.inspector.engine

import io.grimoire.api.model.Chapter
import io.grimoire.api.model.Filter
import io.grimoire.api.model.Novel
import io.grimoire.api.model.NovelPage
import io.grimoire.api.network.HttpSource
import io.grimoire.api.network.defaultOkHttpClient
import io.grimoire.api.source.CatalogueSource
import io.grimoire.api.source.ConfigurableSource
import io.grimoire.api.source.EpubSource
import io.grimoire.api.source.MultiHostSource
import io.grimoire.api.source.MultiLanguageSource
import io.grimoire.api.source.PaginatedSource
import io.grimoire.api.source.SourcePreference
import io.grimoire.api.source.WebViewLoginSource
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
 */
/** Outcome of probing whether an image URL loads. */
class ImageProbe(val ok: Boolean, val detail: String)

class SourceOps(val ds: DiscoveredSource) {

    val source = ds.instance
    val catalogue: CatalogueSource? = source as? CatalogueSource
    private val multiHost: MultiHostSource? = source as? MultiHostSource

    private val multiLang: MultiLanguageSource? = source as? MultiLanguageSource

    val hosts: List<String> get() = multiHost?.hosts ?: emptyList()
    val activeHost: String? get() = multiHost?.activeHost

    /** Pin the mirror to route through (blank resets to the first host). */
    fun setHost(host: String) = multiHost?.setActiveHost(host) ?: Unit

    val languages: List<String> get() = multiLang?.availableLanguages() ?: emptyList()

    /** Restrict browse/search to these languages (empty = no filter, all). */
    fun setLanguages(langs: Set<String>) = multiLang?.setEnabledLanguages(langs) ?: Unit

    suspend fun popular(page: Int): List<Novel> = cat().getPopularNovels(page)
    suspend fun latest(page: Int): List<Novel> = cat().getLatestUpdates(page)
    suspend fun search(query: String, page: Int, filters: List<Filter<*>> = emptyList()): List<Novel> =
        cat().searchNovels(query, page, filters)

    fun filterList(): List<Filter<*>> = catalogue?.getFilterList() ?: emptyList()
    suspend fun fetchFilters(): List<Filter<*>> = cat().fetchFilterOptions()

    /** A brand-new instance of this source, via the same no-arg ctor the app
     *  uses. `fetchFilterOptions` mutates a source's filter state, so the
     *  dynamic-filters check needs a cold instance to compare before/after —
     *  the shared [source] keeps options cached between runs. */
    fun freshCatalogue(): CatalogueSource? =
        runCatching { source.javaClass.getDeclaredConstructor().newInstance() as? CatalogueSource }.getOrNull()

    suspend fun details(url: String): Novel = source.getNovelDetails(stubNovel(url))

    suspend fun chapters(url: String, page: Int? = null, concurrency: Int = 1): List<Chapter> {
        val novel = stubNovel(url)
        val paged = source as? PaginatedSource
        // Explicit page → that single page. No page → the full list: a paginated
        // source's getChapterList(novel) only returns page 1, so walk pages until
        // one is empty or stops yielding new URLs (overflow guard), accumulating.
        // concurrency>1 fetches pages in parallel batches (faster for long lists).
        return when {
            page != null && paged != null -> paged.getChapterList(novel, page)
            paged != null -> allChapterPages(paged, novel, concurrency.coerceIn(1, MAX_CHAPTER_CONCURRENCY))
            else -> source.getChapterList(novel)
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

    suspend fun pages(url: String): List<NovelPage> = source.getPageList(stubChapter(url))

    suspend fun epub(url: String): ByteArray = (source as EpubSource).getEpub(stubNovel(url))

    fun prefs(): List<SourcePreference> = (source as? ConfigurableSource)?.getPreferences() ?: emptyList()
    fun setPrefs(values: Map<String, String>) = (source as? ConfigurableSource)?.setPreferences(values) ?: Unit

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
        if (source is CatalogueSource) add("CatalogueSource")
        if (source is ConfigurableSource) add("ConfigurableSource")
        if (source is WebViewLoginSource) add("WebViewLoginSource")
        if (source is MultiLanguageSource) add("MultiLanguageSource")
        if (source is PaginatedSource) add("PaginatedSource")
        if (source is EpubSource) add("EpubSource")
        if (source is MultiHostSource) add("MultiHostSource")
    }

    fun meta(): SourceMeta = SourceMeta(
        id = ds.id,
        name = ds.name,
        lang = ds.lang,
        baseUrl = ds.baseUrl,
        versionCode = ds.versionCode,
        className = ds.className,
        capabilities = capabilities(),
        hasDynamicFilters = catalogue?.hasDynamicFilters ?: false,
        supportsSearchWithFilters = catalogue?.supportsSearchWithFilters ?: false,
        hosts = hosts,
        activeHost = activeHost,
        languages = languages,
    )

    private fun cat(): CatalogueSource =
        catalogue ?: error("${ds.name} is not a CatalogueSource (cannot browse)")

    // The host passes full domain objects; for one-shot calls we only need the
    // url the request builders read.
    private fun stubNovel(url: String) = Novel(url = url, title = "")
    private fun stubChapter(url: String) = Chapter(url = url, name = "")

    companion object {
        // Safety cap on chapter-page walking, so a source that never returns an
        // empty page can't loop forever.
        private const val MAX_CHAPTER_PAGES = 500

        // Upper bound on parallel page fetches, to avoid hammering a source.
        private const val MAX_CHAPTER_CONCURRENCY = 16
    }
}
