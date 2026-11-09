package io.grimoire.inspector

import android.webkit.CookieManager
import io.grimoire.api.network.CloudflareException
import io.grimoire.api.network.defaultOkHttpClient
import io.grimoire.api.source.Source
import io.grimoire.api.source.http.HttpSource
import io.grimoire.api.source.sourceIdFor
import io.grimoire.inspector.engine.InspectorNetwork
import io.grimoire.inspector.engine.NetworkUa
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.Request
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import kotlin.test.*

class InspectorNetworkTest {
    private val cm = CookieManager.getInstance()

    @BeforeEach fun reset() {
        InspectorNetwork.install()
        InspectorNetwork.cookieJar.clear()
        NetworkUa.clear()
    }

    @Test fun `host-only domain path secure and expiry are enforced`() {
        cm.setCookie("https://example.com/account/login", "host=1; Path=/")
        cm.setCookie("https://example.com/", "domain=1; Domain=example.com; Path=/")
        cm.setCookie("https://example.com/", "private=1; Path=/account; Secure")
        cm.setCookie("https://example.com/", "empty=; Path=/")
        assertTrue(cm.getCookie("https://example.com/")!!.contains("empty="))
        assertEquals("domain=1", cm.getCookie("https://sub.example.com/account"))
        assertFalse(cm.getCookie("http://example.com/account")!!.contains("private="))
        assertFalse(cm.getCookie("https://example.com/accounting")!!.contains("private="))
        assertNull(cm.getCookie("https://otherexample.com/account"))
        assertTrue(cm.getCookie("https://example.com/account/read")!!.startsWith("private=1"))
        cm.setCookie("https://example.com/", "host=gone; Max-Age=0; Path=/")
        cm.setCookie("https://example.com/", "expired=1; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/")
        assertFalse(cm.getCookie("https://example.com/")!!.contains("host="))
        assertFalse(cm.getCookie("https://example.com/")!!.contains("expired="))
        cm.setCookie("https://example.com/", "alien=1; Domain=elsewhere.com")
        assertNull(cm.getCookie("https://elsewhere.com/"))
    }

    @Test fun `path variants survive replacement and session cleanup`() {
        cm.setCookie("https://example.com/", "token=root; Path=/; Max-Age=60")
        cm.setCookie("https://example.com/", "token=account; Path=/account")
        cm.setCookie("https://example.com/", "token=changed; Path=/account")
        assertEquals("token=changed; token=root", cm.getCookie("https://example.com/account"))
        cm.removeSessionCookies(null)
        assertEquals("token=root", cm.getCookie("https://example.com/account"))
        cm.removeAllCookies(null)
        assertNull(cm.getCookie("https://example.com/"))
    }

    @Test fun `HTTP responses and direct source cookie calls share the same store and UA`() {
        MockWebServer().use { server ->
            val client = defaultOkHttpClient()
            assertSame(client, defaultOkHttpClient())
            val url = server.url("/account/read")
            cm.setCookie(url.toString(), "pasted=1; Path=/")
            NetworkUa.override(" fixture-browser/1 ")
            server.enqueue(MockResponse().addHeader("Set-Cookie", "received=2; Path=/account").setBody("ok"))
            client.newCall(Request.Builder().url(url).build()).execute().use { assertEquals("ok", it.body!!.string()) }
            val first = server.takeRequest()
            assertEquals("pasted=1", first.getHeader("Cookie"))
            assertEquals("fixture-browser/1", first.getHeader("User-Agent"))
            assertEquals("received=2; pasted=1", cm.getCookie(url.toString()))
            NetworkUa.override("fixture-browser/2")
            server.enqueue(MockResponse())
            client.newCall(Request.Builder().url(url).build()).execute().close()
            val second = server.takeRequest()
            assertEquals("fixture-browser/2", second.getHeader("User-Agent"))
            assertEquals("received=2; pasted=1", second.getHeader("Cookie"))
            NetworkUa.override(" ")
            assertFalse(NetworkUa.isOverridden)
        }
    }

    @Test fun `challenges are reported while origin errors remain readable`() {
        MockWebServer().use { server ->
            val url = server.url("/")
            server.enqueue(MockResponse().setResponseCode(403).addHeader("cf-mitigated", "challenge").setBody("challenge"))
            assertFailsWith<CloudflareException> {
                defaultOkHttpClient().newCall(Request.Builder().url(url).build()).execute().close()
            }
            server.enqueue(MockResponse().setResponseCode(503).addHeader("Server", "cloudflare")
                .addHeader("Content-Type", "text/html").setBody("Service Temporarily Unavailable"))
            defaultOkHttpClient().newCall(Request.Builder().url(url).build()).execute().use {
                assertEquals(503, it.code)
                assertEquals("Service Temporarily Unavailable", it.body!!.string())
            }
            assertEquals(2, server.requestCount)
        }
    }

    @Test fun `discovery uses the single host API artifact and stable source identity`() {
        val royal = SourceDiscovery.discover().single { it.className == "io.grimoire.extension.en.royalroad.RoyalRoad" }
        assertEquals(sourceIdFor("io.grimoire.extension.en.royalroad"), royal.id)
        assertEquals(5, royal.versionCode)
        assertSame(defaultOkHttpClient(), (royal.instance as HttpSource).client)
        val resources = Source::class.java.classLoader.getResources("io/grimoire/api/source/Source.class").toList()
        assertEquals(1, resources.size)
        assertTrue(resources.single().toString().contains("extensions-core"), resources.toString())
        assertNull(io.grimoire.api.network.NetworkContext.context)
        assertFailsWith<ClassNotFoundException> { Class.forName("io.grimoire.api.network.WebViewCookieJar") }
    }
}
