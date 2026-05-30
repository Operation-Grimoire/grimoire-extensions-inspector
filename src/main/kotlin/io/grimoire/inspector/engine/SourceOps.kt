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
import io.grimoire.api.source.MultiLanguageSource
import io.grimoire.api.source.PaginatedSource
import io.grimoire.api.source.SourcePreference
import io.grimoire.api.source.WebViewLoginSource
import io.grimoire.inspector.DiscoveredSource
import okhttp3.OkHttpClient

/**
 * Thin, app-mimicking wrapper around a single source instance. Every live
 * operation goes through here so the CLI suite and the web endpoints behave
 * identically.
 */
class SourceOps(val ds: DiscoveredSource) {

    val source = ds.instance
    val catalogue: CatalogueSource? = source as? CatalogueSource

    suspend fun popular(page: Int): List<Novel> = cat().getPopularNovels(page)
    suspend fun latest(page: Int): List<Novel> = cat().getLatestUpdates(page)
    suspend fun search(query: String, page: Int, filters: List<Filter<*>> = emptyList()): List<Novel> =
        cat().searchNovels(query, page, filters)

    fun filterList(): List<Filter<*>> = catalogue?.getFilterList() ?: emptyList()
    suspend fun fetchFilters(): List<Filter<*>> = cat().fetchFilterOptions()

    suspend fun details(url: String): Novel = source.getNovelDetails(stubNovel(url))

    suspend fun chapters(url: String, page: Int? = null): List<Chapter> {
        val novel = stubNovel(url)
        val paged = source as? PaginatedSource
        // Explicit page → that single page. No page → the full list: a paginated
        // source's getChapterList(novel) only returns page 1, so walk pages until
        // one is empty or stops yielding new URLs (overflow guard), accumulating.
        return when {
            page != null && paged != null -> paged.getChapterList(novel, page)
            paged != null -> {
                val all = mutableListOf<Chapter>()
                val seen = HashSet<String>()
                var p = 1
                while (p <= MAX_CHAPTER_PAGES) {
                    val batch = paged.getChapterList(novel, p)
                    if (batch.isEmpty()) break
                    val newCount = batch.count { seen.add(it.url) } // count{}: no short-circuit
                    all += batch
                    if (newCount == 0) break // page repeated only already-seen URLs → stop
                    p++
                }
                all
            }
            else -> source.getChapterList(novel)
        }
    }

    suspend fun pages(url: String): List<NovelPage> = source.getPageList(stubChapter(url))

    fun prefs(): List<SourcePreference> = (source as? ConfigurableSource)?.getPreferences() ?: emptyList()
    fun setPrefs(values: Map<String, String>) = (source as? ConfigurableSource)?.setPreferences(values) ?: Unit

    val loginUrl: String? get() = (source as? WebViewLoginSource)?.loginUrl
    suspend fun isLoggedIn(): Boolean? = (source as? WebViewLoginSource)?.isLoggedIn()

    /** The source's own OkHttp client (UA + cookie jar), for the image proxy. */
    fun client(): OkHttpClient = (source as? HttpSource)?.client ?: defaultOkHttpClient()

    fun capabilities(): List<String> = buildList {
        if (source is CatalogueSource) add("CatalogueSource")
        if (source is ConfigurableSource) add("ConfigurableSource")
        if (source is WebViewLoginSource) add("WebViewLoginSource")
        if (source is MultiLanguageSource) add("MultiLanguageSource")
        if (source is PaginatedSource) add("PaginatedSource")
        if (source is EpubSource) add("EpubSource")
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
    }
}
