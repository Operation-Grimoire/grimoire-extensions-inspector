package io.grimoire.inspector.web

import io.grimoire.api.network.CloudflareException
import io.grimoire.inspector.DiscoveredSource
import io.grimoire.inspector.SourceDiscovery
import io.grimoire.inspector.engine.ApiError
import io.grimoire.inspector.engine.CookiesReq
import io.grimoire.inspector.engine.Inspector
import io.grimoire.inspector.engine.LoginDto
import io.grimoire.inspector.engine.NetworkUa
import io.grimoire.inspector.engine.PrefsReq
import io.grimoire.inspector.engine.RunReq
import io.grimoire.inspector.engine.SearchReq
import io.grimoire.inspector.engine.SourceOps
import io.grimoire.inspector.engine.UaDto
import io.grimoire.inspector.engine.UaReq
import io.grimoire.inspector.engine.UrlReq
import io.grimoire.inspector.engine.toDto
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.call
import io.ktor.server.application.install
import io.ktor.server.cio.CIO
import io.ktor.server.engine.embeddedServer
import io.ktor.server.http.content.singlePageApplication
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.response.respondBytes
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import io.ktor.server.routing.routing
import io.ktor.util.pipeline.PipelineContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.Request

fun startServer(port: Int, sources: List<DiscoveredSource>) {
    val byId = sources.associateBy { it.id }

    embeddedServer(CIO, port = port) {
        install(ContentNegotiation) { json(Json { encodeDefaults = true; prettyPrint = false }) }
        routing {
            route("/api") {
                get("/sources") {
                    call.respond(byId.values.sortedBy { it.id }.map { SourceOps(it).meta() })
                }

                route("/sources/{id}") {
                    get("/popular") {
                        val o = resolve(byId) ?: return@get
                        val page = call.queryInt("page", 1)
                        call.guarded { call.respond(o.popular(page).map { it.toDto() }) }
                    }
                    get("/latest") {
                        val o = resolve(byId) ?: return@get
                        val page = call.queryInt("page", 1)
                        call.guarded { call.respond(o.latest(page).map { it.toDto() }) }
                    }
                    post("/search") {
                        val o = resolve(byId) ?: return@post
                        val req = call.receive<SearchReq>()
                        call.guarded { call.respond(o.search(req.query, req.page).map { it.toDto() }) }
                    }
                    get("/filters") {
                        val o = resolve(byId) ?: return@get
                        val fetch = call.request.queryParameters["fetch"] == "true"
                        call.guarded {
                            val filters = if (fetch && (o.catalogue?.hasDynamicFilters == true)) o.fetchFilters() else o.filterList()
                            call.respond(filters.map { it.toDto() })
                        }
                    }
                    post("/novel") {
                        val o = resolve(byId) ?: return@post
                        val req = call.receive<UrlReq>()
                        call.guarded { call.respond(o.details(req.url).toDto()) }
                    }
                    post("/chapters") {
                        val o = resolve(byId) ?: return@post
                        val req = call.receive<UrlReq>()
                        call.guarded { call.respond(o.chapters(req.url, req.page).map { it.toDto() }) }
                    }
                    post("/pages") {
                        val o = resolve(byId) ?: return@post
                        val req = call.receive<UrlReq>()
                        call.guarded { call.respond(o.pages(req.url).map { it.toDto() }) }
                    }
                    get("/prefs") {
                        val o = resolve(byId) ?: return@get
                        call.respond(o.prefs().map { it.toDto() })
                    }
                    post("/prefs") {
                        val o = resolve(byId) ?: return@post
                        val req = call.receive<PrefsReq>()
                        o.setPrefs(req.values)
                        call.respond(mapOf("ok" to true))
                    }
                    get("/login") {
                        val o = resolve(byId) ?: return@get
                        call.guarded { call.respond(LoginDto(o.loginUrl, o.isLoggedIn())) }
                    }
                    get("/cookies") {
                        val o = resolve(byId) ?: return@get
                        val target = call.request.queryParameters["url"] ?: o.ds.baseUrl
                        val cm = android.webkit.CookieManager.getInstance()
                        call.respond(mapOf("url" to target, "cookies" to (cm.getCookie(target) ?: "")))
                    }
                    post("/cookies") {
                        val o = resolve(byId) ?: return@post
                        val req = call.receive<CookiesReq>()
                        val target = req.url ?: o.ds.baseUrl
                        val cm = android.webkit.CookieManager.getInstance()
                        req.cookies.split(';').map { it.trim() }.filter { it.isNotEmpty() }
                            .forEach { cm.setCookie(target, it) }
                        call.respond(mapOf("applied" to target))
                    }
                    delete("/cookies") {
                        resolve(byId) ?: return@delete
                        android.webkit.CookieManager.getInstance().removeAllCookies(null)
                        call.respond(mapOf("ok" to true))
                    }
                }

                // Global User-Agent override (shared across sources, since the
                // API's NetworkContext UA is a singleton). Match it to the
                // browser that solved Cloudflare so cf_clearance is accepted.
                get("/ua") {
                    call.respond(UaDto(NetworkUa.effective(), NetworkUa.isOverridden))
                }
                post("/ua") {
                    val req = call.receive<UaReq>()
                    NetworkUa.override(req.userAgent)
                    call.respond(UaDto(NetworkUa.effective(), NetworkUa.isOverridden))
                }

                post("/run") {
                    val req = call.receive<RunReq>()
                    var sel = byId.values.toList()
                    req.source?.let { s -> sel = sel.filter { it.id.toString() == s || it.name.equals(s, true) || it.name.contains(s, true) } }
                    req.lang?.let { l -> sel = sel.filter { it.lang.equals(l, true) } }
                    val report = Inspector(req.query ?: "the", offline = req.offline).run(sel.sortedBy { it.id })
                    call.respond(report)
                }
            }

            // Image proxy — fetch covers / page images through the source's own
            // OkHttp client so UA, cookies, and Cloudflare state apply.
            get("/img") {
                val id = call.request.queryParameters["source"]?.toLongOrNull()
                val url = call.request.queryParameters["url"]
                val ds = id?.let { byId[it] }
                if (ds == null || url.isNullOrBlank()) {
                    call.respond(HttpStatusCode.BadRequest, ApiError("missing source/url", "BAD_REQUEST"))
                    return@get
                }
                val full = if (url.startsWith("http")) url
                else ds.baseUrl.trimEnd('/') + "/" + url.trimStart('/')
                try {
                    val client = SourceOps(ds).client()
                    val (bytes, ct) = withContext(Dispatchers.IO) {
                        client.newCall(Request.Builder().url(full).build()).execute().use { resp ->
                            val body = resp.body
                            if (!resp.isSuccessful || body == null) {
                                error("upstream ${resp.code}")
                            }
                            body.bytes() to (body.contentType()?.toString() ?: "image/jpeg")
                        }
                    }
                    call.respondBytes(bytes, ContentType.parse(ct))
                } catch (e: Throwable) {
                    call.respond(HttpStatusCode.BadGateway, ApiError(e.message ?: "image error", "IMG_ERROR", e.javaClass.simpleName))
                }
            }

            // Static SPA from resources/web/, with index.html fallback so deep
            // client-side routes (e.g. /source/5/popular) load under BrowserRouter.
            singlePageApplication {
                useResources = true
                filesPath = "web"
                defaultPage = "index.html"
            }
        }
    }.start(wait = true)
}

private fun PipelineContext<Unit, ApplicationCall>.resolveBlockingId(): Long? =
    call.parameters["id"]?.toLongOrNull()

private suspend fun PipelineContext<Unit, ApplicationCall>.resolve(byId: Map<Long, DiscoveredSource>): SourceOps? {
    val id = resolveBlockingId()
    val ds = id?.let { byId[it] }
    if (ds == null) {
        call.respond(HttpStatusCode.NotFound, ApiError("no source id=$id", "NOT_FOUND"))
        return null
    }
    return SourceOps(ds)
}

private fun ApplicationCall.queryInt(name: String, default: Int): Int =
    request.queryParameters[name]?.toIntOrNull() ?: default

private suspend fun ApplicationCall.guarded(block: suspend () -> Unit) {
    try {
        block()
    } catch (e: Throwable) {
        fail(e)
    }
}

private suspend fun ApplicationCall.fail(e: Throwable) {
    val (code, status) = when (e) {
        is CloudflareException -> "CLOUDFLARE_BLOCKED" to HttpStatusCode.BadGateway
        is java.net.SocketTimeoutException -> "TIMEOUT" to HttpStatusCode.GatewayTimeout
        is java.net.UnknownHostException -> "DNS_ERROR" to HttpStatusCode.BadGateway
        is java.io.IOException -> "NETWORK_ERROR" to HttpStatusCode.BadGateway
        else -> "EXCEPTION" to HttpStatusCode.InternalServerError
    }
    respond(status, ApiError(e.message ?: e.toString(), code, e.javaClass.simpleName))
}
