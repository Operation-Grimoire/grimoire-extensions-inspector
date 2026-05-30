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
        val noUrl = list.filter { it.url.isBlank() }
        if (noUrl.isNotEmpty()) diags += Diagnostic(
            "chapters", Severity.ERROR, "CHAPTER_URL_EMPTY",
            "${noUrl.size}/${list.size} chapters have a blank url", noUrl.size,
            noUrl.take(SAMPLE).map { "#${list.indexOf(it)} ${it.name.ifBlank { "(unnamed)" }}" },
        )
        val noName = list.filter { it.name.isBlank() }
        if (noName.isNotEmpty()) diags += Diagnostic(
            "chapters", Severity.WARN, "CHAPTER_NAME_EMPTY",
            "${noName.size}/${list.size} chapters have a blank name", noName.size,
            noName.take(SAMPLE).map { it.url },
        )
        val dupeCounts = list.map { it.url }.groupingBy { it }.eachCount().filter { it.value > 1 }
        val dupes = dupeCounts.values.sumOf { it - 1 }
        if (dupes > 0) diags += Diagnostic(
            "chapters", Severity.ERROR, "CHAPTER_URL_DUPLICATE",
            "$dupes duplicate chapter url(s) — duplicate Compose keys crash the reader list", dupes,
            dupeCounts.entries.take(SAMPLE).map { "${it.key} ×${it.value}" },
        )
        return diags
    }

    fun pages(list: List<NovelPage>): List<Diagnostic> {
        if (list.isEmpty()) {
            return listOf(Diagnostic("pages", Severity.ERROR, "PAGE_LIST_EMPTY", "getPageList returned 0 pages"))
        }
        val content = list.filter { !it.isSeparator }
        val blanks = content.filter { it.text.isBlank() && it.formattedText.isNullOrBlank() && it.imageUrl.isNullOrBlank() }
        return when {
            content.isNotEmpty() && blanks.size == content.size ->
                listOf(Diagnostic("pages", Severity.ERROR, "PAGE_ALL_BLANK", "all ${content.size} content pages are empty (no text, no image)", content.size, content.take(SAMPLE).map { "page #${it.index}" }))
            blanks.isNotEmpty() ->
                listOf(Diagnostic("pages", Severity.WARN, "PAGE_TEXT_EMPTY", "${blanks.size}/${list.size} pages have no text and no image", blanks.size, blanks.take(SAMPLE).map { "page #${it.index}" }))
            else -> emptyList()
        }
    }
}
