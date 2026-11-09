package io.grimoire.inspector.engine

/** Process-wide UA override shared by all source clients, including existing ones. */
object NetworkUa {
    private const val DEFAULT = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
    @Volatile private var value: String? = null
    val isOverridden: Boolean get() = value != null
    fun override(ua: String?) { value = ua?.trim()?.takeIf { it.isNotEmpty() } }
    fun clear() { value = null }
    fun effective(): String = value ?: DEFAULT
}
