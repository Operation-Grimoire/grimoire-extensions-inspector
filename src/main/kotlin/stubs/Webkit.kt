package android.webkit

import io.grimoire.inspector.engine.InspectorNetwork
import okhttp3.Cookie
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

/** Compatibility bridge for sources that call CookieManager directly. No browser is present. */
class CookieManager private constructor() {
    fun setCookie(url: String, value: String?) {
        val target = url.toHttpUrlOrNull() ?: return
        val cookie = value?.let { Cookie.parse(target, it) } ?: return
        InspectorNetwork.cookieJar.saveFromResponse(target, listOf(cookie))
    }
    fun getCookie(url: String): String? = url.toHttpUrlOrNull()?.let { target ->
        InspectorNetwork.cookieJar.loadForRequest(target).takeIf { it.isNotEmpty() }
            ?.joinToString("; ") { "${it.name}=${it.value}" }
    }
    fun flush() = Unit
    fun setAcceptCookie(accept: Boolean) = Unit
    fun acceptCookie(): Boolean = true
    fun removeAllCookies(callback: Any?) = InspectorNetwork.cookieJar.clear()
    fun removeSessionCookies(callback: Any?) = InspectorNetwork.cookieJar.clearSession()
    companion object {
        private val instance = CookieManager()
        @JvmStatic fun getInstance(): CookieManager = instance
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
    open fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) = Unit
    open fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean = false
    open fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: WebResourceResponse) = Unit
    open fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) = Unit
}

interface WebResourceRequest {
    val url: android.net.Uri
    val isForMainFrame: Boolean
}

class WebResourceResponse(val statusCode: Int)
class WebResourceError(val errorCode: Int)

class WebView(context: android.content.Context) {
    val settings: WebSettings = WebSettings()
    var webViewClient: WebViewClient = WebViewClient()
    fun evaluateJavascript(script: String, callback: (String) -> Unit) = Unit
    fun loadUrl(url: String) = Unit
    fun stopLoading() = Unit
    fun destroy() = Unit
}
