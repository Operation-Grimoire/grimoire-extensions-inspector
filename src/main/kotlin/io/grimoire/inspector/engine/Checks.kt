package io.grimoire.inspector.engine

import io.grimoire.api.model.Chapter
import io.grimoire.api.model.Novel
import io.grimoire.api.model.NovelPage
import io.grimoire.api.model.NovelStatus
import java.util.zip.ZipInputStream

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

    fun details(n: Novel, multiLang: Boolean = false): List<Diagnostic> = buildList {
        if (n.title.isBlank()) add(Diagnostic("details", Severity.WARN, "TITLE_EMPTY", "detail page has a blank title", samples = listOf(n.url)))
        if (n.thumbnailUrl.isNullOrBlank()) add(Diagnostic("details", Severity.WARN, "THUMBNAIL_EMPTY", "detail page has an empty thumbnailUrl", samples = listOf(n.url)))
        if (n.description.isNullOrBlank()) add(Diagnostic("details", Severity.WARN, "DESCRIPTION_EMPTY", "detail page has an empty description"))
        if (n.author.isNullOrBlank()) add(Diagnostic("details", Severity.WARN, "AUTHOR_EMPTY", "detail page has an empty author"))
        if (n.genres.isEmpty()) add(Diagnostic("details", Severity.WARN, "GENRES_EMPTY", "detail page has no genres"))
        if (n.status == NovelStatus.UNKNOWN) add(Diagnostic("details", Severity.INFO, "STATUS_UNKNOWN", "novel.status=UNKNOWN (not parsed)"))
        if (n.rating == null) add(Diagnostic("details", Severity.INFO, "RATING_EMPTY", "novel.rating is null (no rating parsed)"))
        if (n.language.isNullOrBlank()) {
            if (multiLang) add(Diagnostic("details", Severity.ERROR, "LANGUAGE_REQUIRED", "multi-language source left novel.language null — host can't tell which language this is"))
            else add(Diagnostic("details", Severity.INFO, "LANGUAGE_EMPTY", "novel.language is null"))
        }
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
        if (list.all { it.chapterNumber < 0 }) diags += Diagnostic(
            "chapters", Severity.WARN, "CHAPTER_NUMBER_UNSET",
            "no chapter has a chapterNumber (all -1) — host can't order/track by number",
        )
        val noDate = list.withIndex().filter { it.value.uploadDate == 0L }
        when {
            noDate.size == list.size -> diags += Diagnostic(
                "chapters", Severity.INFO, "UPLOAD_DATE_MISSING",
                "no chapter has an uploadDate (all 0)", list.size,
            )
            noDate.isNotEmpty() -> diags += Diagnostic(
                "chapters", Severity.WARN, "UPLOAD_DATE_PARTIAL",
                "${noDate.size}/${list.size} chapters have no uploadDate while others do (inconsistent parse)",
                noDate.size,
                noDate.take(SAMPLE).map { "#${it.index} ${it.value.name.ifBlank { "(unnamed)" }}" },
            )
        }
        return diags
    }

    /** Validate the bytes from EpubSource.getEpub: non-empty, a real zip, and a
     *  well-formed EPUB (mimetype + an .opf package document). */
    fun epub(bytes: ByteArray): List<Diagnostic> {
        if (bytes.isEmpty()) {
            return listOf(Diagnostic("epub", Severity.ERROR, "EPUB_EMPTY", "getEpub returned 0 bytes"))
        }
        val isZip = bytes.size >= 4 &&
            bytes[0].toInt() == 0x50 && bytes[1].toInt() == 0x4B &&
            bytes[2].toInt() == 0x03 && bytes[3].toInt() == 0x04
        if (!isZip) {
            return listOf(Diagnostic("epub", Severity.ERROR, "EPUB_NOT_ZIP", "bytes are not a zip (no PK magic) — size=${bytes.size}, looks like ${sniff(bytes)}"))
        }
        val entries = mutableListOf<String>()
        var mimetype: String? = null
        runCatching {
            ZipInputStream(bytes.inputStream()).use { zin ->
                var e = zin.nextEntry
                while (e != null) {
                    entries += e.name
                    if (e.name == "mimetype") mimetype = zin.readBytes().decodeToString().trim()
                    e = zin.nextEntry
                }
            }
        }.onFailure {
            return listOf(Diagnostic("epub", Severity.ERROR, "EPUB_CORRUPT", "zip could not be read: ${it.message}", exceptionType = it.javaClass.simpleName))
        }
        val diags = mutableListOf<Diagnostic>()
        if (mimetype != "application/epub+zip") {
            diags += Diagnostic("epub", Severity.WARN, "EPUB_BAD_MIMETYPE", "mimetype is '${mimetype ?: "missing"}' (expected application/epub+zip)")
        }
        if (entries.none { it.endsWith(".opf") }) {
            diags += Diagnostic("epub", Severity.ERROR, "EPUB_NO_OPF", "no .opf package document in the archive")
        }
        diags += Diagnostic("epub", Severity.INFO, "EPUB_OK", "${entries.size} entries, ${bytes.size} bytes", entries.size, entries.take(SAMPLE))
        return diags
    }

    /** Best-effort guess at what non-epub payload a source returned instead. */
    private fun sniff(bytes: ByteArray): String {
        val head = bytes.take(64).toByteArray().decodeToString().trimStart().lowercase()
        return when {
            head.startsWith("<!doctype html") || head.startsWith("<html") -> "an HTML page"
            head.startsWith("{") || head.startsWith("[") -> "JSON"
            head.startsWith("<?xml") -> "XML"
            else -> "binary/other"
        }
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
