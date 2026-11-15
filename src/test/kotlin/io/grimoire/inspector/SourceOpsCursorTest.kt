package io.grimoire.inspector

import io.grimoire.api.model.lang.Language
import io.grimoire.api.model.novel.Chapter
import io.grimoire.api.model.novel.ChapterPage
import io.grimoire.api.model.novel.Novel
import io.grimoire.api.source.web.CursorPaginatedSource
import io.grimoire.inspector.engine.SourceOps
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class SourceOpsCursorTest {
    private val source = object : CursorPaginatedSource {
        override val name = "Cursor fixture"
        override val lang = Language.EN
        val calls = mutableListOf<String?>()

        override suspend fun getNovelDetails(novel: Novel) = novel

        override suspend fun getChapterList(novel: Novel, cursor: String?): ChapterPage {
            calls += cursor
            val page = calls.size
            return ChapterPage(
                listOf(Chapter("chapter-$page", "Chapter $page", chapterNumber = page.toFloat())),
                nextCursor = if (page < 3) "cursor-$page" else null,
            )
        }
    }
    private val ops = SourceOps(DiscoveredSource(source, 1, source.name, "en", "https://example.com", 1, "fixture"))

    @Test
    fun `cursor source is advertised and walked sequentially`() = runBlocking {
        assertTrue("CursorPaginatedSource" in ops.capabilities())
        assertEquals(listOf(1f, 2f, 3f), ops.chapters("book", concurrency = 4).map { it.chapterNumber })
        assertEquals(listOf(null, "cursor-1", "cursor-2"), source.calls)
        val error = assertFailsWith<IllegalStateException> { ops.chapters("book", page = 2) }
        assertEquals("Cursor fixture uses cursor pagination, not numbered pages", error.message)
    }

    @Test
    fun `one cursor page returns its continuation without forcing a full walk`() = runBlocking {
        val first = ops.chapterPage("book", null)
        assertEquals("cursor-1", first.nextCursor)
        val second = ops.chapterPage("book", first.nextCursor)
        assertEquals("cursor-2", second.nextCursor)
        assertEquals(2f, second.chapters.single().chapterNumber)
        assertEquals(listOf(null, "cursor-1"), source.calls)
    }
}
