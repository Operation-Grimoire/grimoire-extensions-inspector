package io.grimoire.inspector.engine

import io.grimoire.api.model.Chapter
import io.grimoire.api.model.Novel
import io.grimoire.api.model.NovelPage

/** Validations that mirror the breakage the app actually trips over. */
object Checks {

    private const val SAMPLE = 5

    fun novels(stage: String, list: List<Novel>): List<Diagnostic> {
        if (list.isEmpty()) {
            return listOf(Diagnostic(stage, Severity.ERROR, "EMPTY_LIST", "$stage returned 0 novels"))
        }
        val diags = mutableListOf<Diagnostic>()
        val noUrl = list.filter { it.url.isBlank() }
        if (noUrl.isNotEmpty()) diags += Diagnostic(
            stage, Severity.ERROR, "NOVEL_URL_EMPTY",
            "${noUrl.size}/${list.size} novels have a blank url",
            noUrl.size, noUrl.take(SAMPLE).map { it.title },
        )
        val noTitle = list.filter { it.title.isBlank() }
        if (noTitle.isNotEmpty()) diags += Diagnostic(
            stage, Severity.WARN, "TITLE_EMPTY",
            "${noTitle.size}/${list.size} novels have a blank title",
            noTitle.size, noTitle.take(SAMPLE).map { it.url },
        )
        val noThumb = list.filter { it.thumbnailUrl.isNullOrBlank() }
        if (noThumb.isNotEmpty()) diags += Diagnostic(
            stage, Severity.WARN, "THUMBNAIL_EMPTY",
            "${noThumb.size}/${list.size} novels have an empty thumbnailUrl",
            noThumb.size, noThumb.take(SAMPLE).map { it.title },
        )
        return diags
    }

    fun details(n: Novel): List<Diagnostic> = buildList {
        if (n.title.isBlank()) add(Diagnostic("details", Severity.WARN, "TITLE_EMPTY", "detail page has a blank title", samples = listOf(n.url)))
        if (n.thumbnailUrl.isNullOrBlank()) add(Diagnostic("details", Severity.WARN, "THUMBNAIL_EMPTY", "detail page has an empty thumbnailUrl", samples = listOf(n.url)))
        if (n.description.isNullOrBlank()) add(Diagnostic("details", Severity.WARN, "DESCRIPTION_EMPTY", "detail page has an empty description"))
        if (!n.initialized) add(Diagnostic("details", Severity.INFO, "NOT_INITIALIZED", "novel.initialized=false (host treats it as a stub)"))
    }

    fun chapters(list: List<Chapter>): List<Diagnostic> {
        if (list.isEmpty()) {
            return listOf(Diagnostic("chapters", Severity.ERROR, "CHAPTER_LIST_EMPTY", "getChapterList returned 0 chapters"))
        }
        val diags = mutableListOf<Diagnostic>()
        val noUrl = list.count { it.url.isBlank() }
        if (noUrl > 0) diags += Diagnostic("chapters", Severity.ERROR, "CHAPTER_URL_EMPTY", "$noUrl/${list.size} chapters have a blank url", noUrl)
        val noName = list.count { it.name.isBlank() }
        if (noName > 0) diags += Diagnostic("chapters", Severity.WARN, "CHAPTER_NAME_EMPTY", "$noName/${list.size} chapters have a blank name", noName)
        val urls = list.map { it.url }
        val dupes = urls.size - urls.toSet().size
        if (dupes > 0) diags += Diagnostic(
            "chapters", Severity.ERROR, "CHAPTER_URL_DUPLICATE",
            "$dupes duplicate chapter url(s) — duplicate Compose keys crash the reader list", dupes,
        )
        return diags
    }

    fun pages(list: List<NovelPage>): List<Diagnostic> {
        if (list.isEmpty()) {
            return listOf(Diagnostic("pages", Severity.ERROR, "PAGE_LIST_EMPTY", "getPageList returned 0 pages"))
        }
        val content = list.filter { !it.isSeparator }
        val blank = content.count { it.text.isBlank() && it.formattedText.isNullOrBlank() && it.imageUrl.isNullOrBlank() }
        return when {
            content.isNotEmpty() && blank == content.size ->
                listOf(Diagnostic("pages", Severity.ERROR, "PAGE_ALL_BLANK", "all ${content.size} content pages are empty (no text, no image)"))
            blank > 0 ->
                listOf(Diagnostic("pages", Severity.WARN, "PAGE_TEXT_EMPTY", "$blank/${list.size} pages have no text and no image", blank))
            else -> emptyList()
        }
    }
}
