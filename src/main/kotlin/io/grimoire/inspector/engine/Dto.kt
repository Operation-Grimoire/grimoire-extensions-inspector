package io.grimoire.inspector.engine

import io.grimoire.api.model.Chapter
import io.grimoire.api.model.Filter
import io.grimoire.api.model.Novel
import io.grimoire.api.model.NovelPage
import io.grimoire.api.source.SourcePreference
import kotlinx.serialization.Serializable

// --- Wire DTOs (the API models aren't @Serializable, so map to these) --------

@Serializable
data class NovelDto(
    val url: String,
    val title: String,
    val thumbnailUrl: String? = null,
    val author: String? = null,
    val description: String? = null,
    val genres: List<String> = emptyList(),
    val status: String = "UNKNOWN",
    val rating: Float? = null,
    val ratingCount: Int? = null,
    val initialized: Boolean = false,
)

fun Novel.toDto() = NovelDto(
    url, title, thumbnailUrl, author, description, genres,
    status.name, rating, ratingCount, initialized,
)

@Serializable
data class ChapterDto(
    val url: String,
    val name: String,
    val uploadDate: Long = 0L,
    val chapterNumber: Float = -1f,
    val translator: String? = null,
    val locked: Boolean = false,
)

fun Chapter.toDto() = ChapterDto(url, name, uploadDate, chapterNumber, translator, locked)

@Serializable
data class PageDto(
    val index: Int,
    val text: String,
    val imageUrl: String? = null,
    val isSeparator: Boolean = false,
    val formattedText: String? = null,
)

fun NovelPage.toDto() = PageDto(index, text, imageUrl, isSeparator, formattedText)

@Serializable
data class FilterDto(
    val name: String,
    val type: String,
    val values: List<String> = emptyList(),
    val children: List<FilterDto> = emptyList(),
    val state: String? = null,
)

fun Filter<*>.toDto(): FilterDto = when (this) {
    is Filter.Header -> FilterDto(name, "header")
    is Filter.Separator -> FilterDto(name, "separator")
    is Filter.Text -> FilterDto(name, "text", state = state)
    is Filter.CheckBox -> FilterDto(name, "checkbox", state = state.toString())
    is Filter.TriState -> FilterDto(name, "tristate", state = state.toString())
    is Filter.Select<*> -> FilterDto(name, "select", values = values.map { it.toString() }, state = state.toString())
    is Filter.Sort -> FilterDto(
        name, "sort",
        values = values.toList(),
        state = state?.let { "${it.index}:${if (it.ascending) "asc" else "desc"}" },
    )
    is Filter.Group<*> -> FilterDto(
        name, "group",
        children = state.filterIsInstance<Filter<*>>().map { it.toDto() },
    )
}

@Serializable
data class PrefDto(
    val key: String,
    val title: String,
    val summary: String? = null,
    val type: String,
    val default: String = "",
    val isPassword: Boolean = false,
)

fun SourcePreference.toDto(): PrefDto = when (this) {
    is SourcePreference.EditText -> PrefDto(key, title, summary, "editText", default, isPassword)
    is SourcePreference.Switch -> PrefDto(key, title, summary, "switch", default.toString(), false)
}

// --- Request / response DTOs for the web API ---------------------------------

@Serializable
data class SearchReq(val query: String, val page: Int = 1)

@Serializable
data class UrlReq(val url: String, val page: Int? = null)

@Serializable
data class PrefsReq(val values: Map<String, String> = emptyMap())

@Serializable
data class CookiesReq(val cookies: String, val url: String? = null)

@Serializable
data class RunReq(
    val source: String? = null,
    val lang: String? = null,
    val query: String? = null,
    val offline: Boolean = false,
)

@Serializable
data class LoginDto(val loginUrl: String? = null, val isLoggedIn: Boolean? = null)

@Serializable
data class ApiError(val error: String, val code: String, val type: String? = null)
