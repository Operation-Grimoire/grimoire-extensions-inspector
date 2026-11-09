package io.grimoire.inspector.engine

import io.grimoire.api.network.CloudflareException
import io.grimoire.api.network.SourceHttpPlatform
import io.grimoire.api.network.SourceNetwork
import io.grimoire.api.network.isSourceBrowserChallenge
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.Interceptor

/** Explicit JVM host: no Android networking classes or reflective UA mutation. */
object InspectorNetwork : SourceHttpPlatform {
    override val cookieJar = InspectorCookieJar()
    override val userAgent: String get() = NetworkUa.effective()
    override val interceptors = listOf(Interceptor { chain ->
        val response = chain.proceed(chain.request())
        if (response.isSourceBrowserChallenge()) {
            response.close()
            throw CloudflareException(chain.request().url.toString())
        }
        response
    })
    fun install() = SourceNetwork.install(this)
}

/** Ephemeral store; OkHttp owns Set-Cookie parsing and domain/path/Secure matching. */
class InspectorCookieJar : CookieJar {
    private data class Key(val name: String, val domain: String, val path: String)
    private val cookies = linkedMapOf<Key, Cookie>()

    @Synchronized
    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        val now = System.currentTimeMillis()
        cookies.filter { url.host == it.domain || (!it.hostOnly && url.host.endsWith(".${it.domain}")) }
            .forEach { cookie ->
                val key = Key(cookie.name, cookie.domain, cookie.path)
                if (cookie.expiresAt <= now) this.cookies.remove(key) else this.cookies[key] = cookie
            }
    }

    @Synchronized
    override fun loadForRequest(url: HttpUrl): List<Cookie> {
        cookies.values.removeIf { it.expiresAt <= System.currentTimeMillis() }
        return cookies.values.filter { it.matches(url) }.sortedByDescending { it.path.length }
    }

    @Synchronized fun clear() = cookies.clear()
    @Synchronized fun clearSession() { cookies.values.removeIf { !it.persistent } }
}
