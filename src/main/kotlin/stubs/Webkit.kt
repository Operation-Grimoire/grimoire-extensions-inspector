package android.webkit

import java.util.concurrent.ConcurrentHashMap

/**
 * Headless replacement for [android.webkit.CookieManager].
 *
 * A real, in-memory cookie store so that the API's `WebViewCookieJar` (and the
 * couple of extensions that read cookies directly) round-trip Set-Cookie within
 * a run — Set-Cookie from one response is replayed on later requests, exactly
 * like the app, just without persistence across runs.
 */
class CookieManager private constructor() {

    // host -> (cookieName -> "name=value")
    private val store = ConcurrentHashMap<String, ConcurrentHashMap<String, String>>()

    fun setCookie(url: String, value: String?) {
        if (value.isNullOrBlank()) return
        val host = hostOf(url) ?: return
        val pair = value.substringBefore(';').trim()
        val name = pair.substringBefore('=').trim()
        if (name.isEmpty()) return
        val v = pair.substringAfter('=', "").trim()
        val map = store.getOrPut(host) { ConcurrentHashMap() }
        val expired = v.isEmpty() ||
            Regex("(?i)max-age\\s*=\\s*0").containsMatchIn(value) ||
            value.contains("01 Jan 1970", ignoreCase = true)
        if (expired) map.remove(name) else map[name] = "$name=$v"
    }

    fun getCookie(url: String): String? {
        val host = hostOf(url) ?: return null
        val parts = mutableListOf<String>()
        store.forEach { (h, m) ->
            if (host == h || host.endsWith(".$h")) parts += m.values
        }
        return parts.takeIf { it.isNotEmpty() }?.joinToString("; ")
    }

    fun flush() = Unit
    fun setAcceptCookie(accept: Boolean) = Unit
    fun acceptCookie(): Boolean = true
    fun removeAllCookies(callback: Any?) = store.clear()
    fun removeSessionCookies(callback: Any?) = Unit

    private fun hostOf(url: String): String? = runCatching {
        java.net.URI(url).host
    }.getOrNull() ?: url.substringAfter("//", "").substringBefore('/').ifBlank { null }

    companion object {
        @JvmStatic
        private val instance = CookieManager()

        @JvmStatic
        fun getInstance(): CookieManager = instance
    }
}

/** Compile-only stub — never executed (the Cloudflare WebView path needs a
 *  non-null Android Context, which the harness never supplies). */
class WebSettings {
    var javaScriptEnabled: Boolean = false
    var domStorageEnabled: Boolean = false
    var userAgentString: String? = null

    companion object {
        @JvmStatic
        fun getDefaultUserAgent(context: android.content.Context?): String =
            "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) " +
                "Chrome/120.0.0.0 Mobile Safari/537.36"
    }
}

open class WebViewClient {
    open fun onPageFinished(view: WebView, url: String) = Unit
}

class WebView(context: android.content.Context) {
    val settings: WebSettings = WebSettings()
    var webViewClient: WebViewClient = WebViewClient()
    fun loadUrl(url: String) = Unit
    fun stopLoading() = Unit
    fun destroy() = Unit
}
